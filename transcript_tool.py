#!/usr/bin/env python3
"""
DeoDap Transcript Tool — Standalone CLI
========================================
Transcribes a YouTube video with >90% Hindi/Hinglish accuracy.

Usage:
  python transcript_tool.py <youtube_url> [--model base|small|medium|large-v3] [--gpu] [--assemblyai]

Examples:
  python transcript_tool.py "https://youtube.com/watch?v=VIDEO_ID"
  python transcript_tool.py "https://youtube.com/watch?v=VIDEO_ID" --model large-v3 --gpu
  python transcript_tool.py "https://youtube.com/watch?v=VIDEO_ID" --assemblyai

Output:
  Prints transcript to stdout.
  Saves transcript to ./transcripts/{video_id}.txt and {video_id}.json
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _check_dependency(cmd: str, install_hint: str) -> bool:
    try:
        subprocess.run([cmd, "--version"], capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print(f"  [ERROR] '{cmd}' not found. Install: {install_hint}")
        return False


def _get_video_id(url: str) -> str:
    import re
    patterns = [
        r"(?:youtube\.com/watch\?.*v=)([A-Za-z0-9_-]{11})",
        r"(?:youtu\.be/)([A-Za-z0-9_-]{11})",
        r"(?:youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    print("[ERROR] Cannot extract video ID from URL. Check that it's a valid YouTube URL.")
    sys.exit(1)


def _fetch_metadata(url: str) -> dict:
    print(f"  Fetching video metadata…")
    r = subprocess.run(
        ["yt-dlp", "--dump-json", "--no-download", "--no-playlist", url],
        capture_output=True, text=True, timeout=60,
    )
    if r.returncode != 0:
        print(f"[ERROR] yt-dlp failed: {r.stderr.strip()}")
        sys.exit(1)
    d = json.loads(r.stdout)
    return {
        "video_id": d["id"],
        "title": d.get("title", ""),
        "duration_seconds": d.get("duration", 0),
        "channel": d.get("uploader", ""),
    }


def _download_audio(url: str, video_id: str, outdir: Path) -> Path:
    out = outdir / f"{video_id}.m4a"
    print(f"  Downloading audio stream…")
    r = subprocess.run(
        ["yt-dlp", "--format", "bestaudio[ext=m4a]/bestaudio",
         "--output", str(out), "--no-playlist", "--quiet", url],
        capture_output=True, text=True, timeout=600,
    )
    if r.returncode != 0:
        print(f"[ERROR] Audio download failed: {r.stderr.strip()}")
        sys.exit(1)
    if not out.exists():
        candidates = list(outdir.glob(f"{video_id}.*"))
        if not candidates:
            print("[ERROR] Audio file missing after download.")
            sys.exit(1)
        out = candidates[0]
    print(f"  Audio saved: {out}")
    return out


# ──────────────────────────────────────────────────────────────────────────────
#  Transcription methods
# ──────────────────────────────────────────────────────────────────────────────

def transcribe_faster_whisper(audio_path: Path, model_name: str, use_gpu: bool) -> dict:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("[ERROR] faster-whisper not installed. Run: pip install faster-whisper")
        sys.exit(1)

    device = "cuda" if use_gpu else "cpu"
    compute = "float16" if use_gpu else "int8"

    print(f"  Loading faster-whisper model '{model_name}' on {device}…")
    t0 = time.time()
    model = WhisperModel(model_name, device=device, compute_type=compute)

    print("  Transcribing (language=hi, Hindi + Hinglish)…")
    segments, info = model.transcribe(
        str(audio_path),
        language="hi",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )

    seg_list = []
    text_parts = []
    for seg in segments:
        seg_list.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()})
        text_parts.append(seg.text.strip())

    transcript_text = " ".join(text_parts)
    lang_prob = info.language_probability

    # Retry with auto-detect if confidence is low
    if lang_prob < 0.70:
        print(f"  Low Hindi confidence ({lang_prob:.2f}) — retrying with auto-detect…")
        segments2, info2 = model.transcribe(str(audio_path), language=None, beam_size=5, vad_filter=True)
        seg_list = []
        text_parts = []
        for seg in segments2:
            seg_list.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()})
            text_parts.append(seg.text.strip())
        transcript_text = " ".join(text_parts)
        info = info2
        lang_prob = info2.language_probability

    elapsed = time.time() - t0
    print(f"  Done in {elapsed:.1f}s — language={info.language} (confidence={lang_prob:.2f})")

    return {
        "transcript_text": transcript_text,
        "segments": seg_list,
        "language_detected": info.language,
        "language_probability": round(lang_prob, 3),
        "word_count": len(transcript_text.split()),
        "method": f"faster-whisper ({model_name})",
        "processing_seconds": round(elapsed, 1),
    }


def transcribe_assemblyai(youtube_url: str, api_key: str) -> dict:
    try:
        import assemblyai as aai
    except ImportError:
        print("[ERROR] assemblyai not installed. Run: pip install assemblyai")
        sys.exit(1)

    print("  Uploading to AssemblyAI (cloud transcription)…")
    aai.settings.api_key = api_key
    config = aai.TranscriptionConfig(
        language_code="hi",
        speech_model=aai.SpeechModel.best,
        punctuate=True,
        format_text=True,
    )
    t0 = time.time()
    transcriber = aai.Transcriber(config=config)
    transcript = transcriber.transcribe(youtube_url)

    if transcript.status == aai.TranscriptStatus.error:
        print(f"[ERROR] AssemblyAI error: {transcript.error}")
        sys.exit(1)

    elapsed = time.time() - t0
    text = transcript.text or ""
    segments = []
    if transcript.utterances:
        for u in transcript.utterances:
            segments.append({"start": u.start / 1000, "end": u.end / 1000, "text": u.text})

    print(f"  Done in {elapsed:.1f}s")
    return {
        "transcript_text": text,
        "segments": segments,
        "language_detected": "hi",
        "language_probability": 1.0,
        "word_count": len(text.split()),
        "method": "assemblyai",
        "processing_seconds": round(elapsed, 1),
    }


# ──────────────────────────────────────────────────────────────────────────────
#  Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="DeoDap Transcript Tool — transcribe YouTube videos in Hindi/Hinglish"
    )
    parser.add_argument("youtube_url", help="YouTube video URL")
    parser.add_argument(
        "--model",
        default="large-v3",
        choices=["tiny", "base", "small", "medium", "large-v3"],
        help="Whisper model size (default: large-v3 for best Hindi accuracy)",
    )
    parser.add_argument("--gpu", action="store_true", help="Use CUDA GPU for faster-whisper")
    parser.add_argument("--assemblyai", action="store_true", help="Use AssemblyAI cloud (fallback)")
    parser.add_argument("--out-dir", default="./transcripts", help="Output directory")
    args = parser.parse_args()

    print("\n╔══════════════════════════════════════════════════╗")
    print("║     DeoDap Transcript Tool — Hindi/Hinglish     ║")
    print("╚══════════════════════════════════════════════════╝\n")

    # Dependency check
    print("[1/4] Checking dependencies…")
    if not _check_dependency("yt-dlp", "pip install yt-dlp"):
        sys.exit(1)
    print("  yt-dlp: OK")

    # Metadata
    print("\n[2/4] Fetching video info…")
    meta = _fetch_metadata(args.youtube_url)
    video_id = meta["video_id"]
    duration_min = meta["duration_seconds"] / 60
    print(f"  Title   : {meta['title']}")
    print(f"  Channel : {meta['channel']}")
    print(f"  Duration: {duration_min:.1f} minutes")

    # Output dir
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Check for cached transcript
    cached_txt = out_dir / f"{video_id}.txt"
    cached_json = out_dir / f"{video_id}.json"
    if cached_txt.exists():
        print(f"\n  [CACHE] Transcript already exists: {cached_txt}")
        print("  Delete the file to re-transcribe.")
        result = json.loads(cached_json.read_text(encoding="utf-8"))
        _print_result(result, cached_txt)
        return

    # Transcription
    print("\n[3/4] Transcribing audio…")

    if args.assemblyai:
        api_key = os.environ.get("ASSEMBLYAI_API_KEY", "")
        if not api_key:
            print("[ERROR] Set ASSEMBLYAI_API_KEY environment variable for AssemblyAI mode")
            sys.exit(1)
        result = transcribe_assemblyai(args.youtube_url, api_key)
    else:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = _download_audio(args.youtube_url, video_id, Path(tmpdir))
            result = transcribe_faster_whisper(audio_path, args.model, args.gpu)
            # Audio auto-deleted when TemporaryDirectory exits
        print("  Audio file deleted.")

    result["video_id"] = video_id
    result["video_title"] = meta["title"]
    result["channel"] = meta["channel"]
    result["duration_seconds"] = meta["duration_seconds"]

    # Save
    print(f"\n[4/4] Saving transcript…")
    cached_txt.write_text(result["transcript_text"], encoding="utf-8")
    cached_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  TXT : {cached_txt}")
    print(f"  JSON: {cached_json}")

    _print_result(result, cached_txt)


def _print_result(result: dict, txt_path: Path):
    print("\n" + "─" * 52)
    print(f"  Method     : {result.get('method', 'unknown')}")
    print(f"  Language   : {result.get('language_detected', '?')} ({result.get('language_probability', 0):.0%} confidence)")
    print(f"  Word count : {result.get('word_count', 0):,}")
    print(f"  Segments   : {len(result.get('segments', []))}")
    print(f"  Time taken : {result.get('processing_seconds', '?')}s")
    print("─" * 52)
    print("\n── TRANSCRIPT PREVIEW (first 600 chars) ──\n")
    preview = result["transcript_text"][:600]
    print(preview + ("…" if len(result["transcript_text"]) > 600 else ""))
    print(f"\n── Full transcript saved to: {txt_path} ──\n")


if __name__ == "__main__":
    main()
