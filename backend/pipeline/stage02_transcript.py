"""
Stage 02 — Transcript Extraction (the primary AI transcript tool).

Flow:
  1. Check Redis cache (key: transcript:{video_id}) — return immediately if hit
  2. PRIMARY path (USE_GPU=true or forced):
       a. Download audio via yt-dlp
       b. Transcribe with faster-whisper large-v3 (Hindi first, auto-detect fallback)
       c. Delete audio immediately after
  3. FALLBACK path (USE_GPU=false or primary fails):
       a. Upload to AssemblyAI, poll until complete
  4. Cache result in Redis with TTL
  5. Return {transcript_text, segments[], language_detected, word_count}

This is the most critical stage — Hindi/Hinglish accuracy drives all downstream quality.
"""

import asyncio
import logging
import tempfile
import time
from pathlib import Path

from backend.config import settings
from backend.integrations.youtube_client import download_audio
from backend.utils.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

_CACHE_KEY = "transcript:{}"
_MIN_LANGUAGE_CONFIDENCE = 0.70


# ─── Primary: faster-whisper (local) ─────────────────────────────────────────

def _transcribe_with_faster_whisper(audio_path: Path, video_id: str) -> dict:
    from faster_whisper import WhisperModel

    logger.info("[Stage 02] Loading faster-whisper model: %s", settings.whisper_model)
    device = "cuda" if settings.use_gpu else "cpu"
    compute_type = "float16" if settings.use_gpu else "int8"

    model = WhisperModel(
        settings.whisper_model,
        device=device,
        compute_type=compute_type,
    )

    # First attempt: Hindi + Hinglish
    logger.info("[Stage 02] Transcribing with language=hi (Hindi/Hinglish)")
    segments, info = model.transcribe(
        str(audio_path),
        language="hi",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        word_timestamps=False,
    )

    seg_list = []
    full_text_parts = []
    for seg in segments:
        seg_list.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })
        full_text_parts.append(seg.text.strip())

    transcript_text = " ".join(full_text_parts)

    # If language confidence is too low, retry with auto-detect
    detected_lang = info.language
    lang_prob = info.language_probability

    if lang_prob < _MIN_LANGUAGE_CONFIDENCE:
        logger.warning(
            "[Stage 02] Low Hindi confidence %.2f — retrying with language=None",
            lang_prob,
        )
        segments2, info2 = model.transcribe(
            str(audio_path),
            language=None,
            beam_size=5,
            vad_filter=True,
        )
        seg_list = []
        full_text_parts = []
        for seg in segments2:
            seg_list.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
            })
            full_text_parts.append(seg.text.strip())
        transcript_text = " ".join(full_text_parts)
        detected_lang = info2.language
        lang_prob = info2.language_probability

    logger.info(
        "[Stage 02] faster-whisper done — lang=%s (%.2f) words≈%d",
        detected_lang, lang_prob, len(transcript_text.split()),
    )
    return {
        "transcript_text": transcript_text,
        "segments": seg_list,
        "language_detected": detected_lang,
        "language_probability": round(lang_prob, 3),
        "word_count": len(transcript_text.split()),
        "method": "faster-whisper",
    }


# ─── Fallback: AssemblyAI ────────────────────────────────────────────────────

def _transcribe_with_assemblyai(youtube_url: str) -> dict:
    import assemblyai as aai

    logger.info("[Stage 02] Falling back to AssemblyAI")
    aai.settings.api_key = settings.assemblyai_api_key

    config = aai.TranscriptionConfig(
        language_code="hi",
        speech_model=aai.SpeechModel.best,
        punctuate=True,
        format_text=True,
    )
    transcriber = aai.Transcriber(config=config)
    transcript = transcriber.transcribe(youtube_url)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"AssemblyAI error: {transcript.error}")

    segments = []
    if transcript.utterances:
        for u in transcript.utterances:
            segments.append({
                "start": u.start / 1000,
                "end": u.end / 1000,
                "text": u.text,
            })

    text = transcript.text or ""
    logger.info("[Stage 02] AssemblyAI done — words≈%d", len(text.split()))
    return {
        "transcript_text": text,
        "segments": segments,
        "language_detected": "hi",
        "language_probability": 1.0,
        "word_count": len(text.split()),
        "method": "assemblyai",
    }


# ─── Public entry point ──────────────────────────────────────────────────────

def run(video_id: str, youtube_url: str) -> dict:
    """
    Main transcript extraction function.
    Checks cache first, then tries faster-whisper, falls back to AssemblyAI.
    Always deletes the audio file after transcription.
    """
    logger.info("[Stage 02] Starting transcript extraction for video_id=%s", video_id)

    # 1. Cache check (sync — wraps async cache in this sync Celery context)
    cache_key = _CACHE_KEY.format(video_id)
    cached = asyncio.run(cache_get(cache_key))
    if cached:
        logger.info("[Stage 02] Cache hit for video_id=%s", video_id)
        return cached

    result: dict | None = None

    # 2. Primary: faster-whisper (local)
    if settings.use_gpu or not settings.assemblyai_api_key:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = None
            try:
                audio_path = download_audio(youtube_url, video_id, Path(tmpdir))
                result = _transcribe_with_faster_whisper(audio_path, video_id)
            except Exception as exc:
                logger.error(
                    "[Stage 02] faster-whisper failed: %s — trying AssemblyAI fallback",
                    exc,
                )
                result = None
            finally:
                # Always clean up audio
                if audio_path and audio_path.exists():
                    audio_path.unlink()
                    logger.info("[Stage 02] Audio deleted: %s", audio_path)

    # 3. Fallback: AssemblyAI
    if result is None:
        if not settings.assemblyai_api_key:
            raise RuntimeError(
                "No transcription available: USE_GPU=false and no ASSEMBLYAI_API_KEY set"
            )
        result = _transcribe_with_assemblyai(youtube_url)

    # 4. Cache result
    ttl = settings.transcript_cache_ttl_hours * 3600
    asyncio.run(cache_set(cache_key, result, ttl))
    logger.info(
        "[Stage 02] Cached transcript for video_id=%s (TTL=%dh)",
        video_id, settings.transcript_cache_ttl_hours,
    )

    return result
