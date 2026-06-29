"""Tests for Stage 02 — Transcript Extraction."""
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path


SAMPLE_TRANSCRIPT = (
    "Aaj hum dekhenge stainless steel casserole ke baare mein. "
    "Yeh product bahut useful hai Indian kitchen ke liye. "
    "Is casserole mein aap dal, sabzi, sab bana sakte hain. "
    "Price bhi affordable hai aur quality bhi top-notch hai. "
    "Aap ise Grabnix par order kar sakte hain."
)


@patch("backend.pipeline.stage02_transcript.cache_get", return_value=None)
@patch("backend.pipeline.stage02_transcript.cache_set")
@patch("backend.pipeline.stage02_transcript.download_audio")
@patch("backend.pipeline.stage02_transcript._transcribe_with_faster_whisper")
def test_primary_path_success(mock_whisper, mock_download, mock_cache_set, mock_cache_get, tmp_path):
    mock_audio = tmp_path / "test.m4a"
    mock_audio.touch()
    mock_download.return_value = mock_audio

    expected = {
        "transcript_text": SAMPLE_TRANSCRIPT,
        "segments": [{"start": 0.0, "end": 5.0, "text": SAMPLE_TRANSCRIPT}],
        "language_detected": "hi",
        "language_probability": 0.97,
        "word_count": len(SAMPLE_TRANSCRIPT.split()),
        "method": "faster-whisper",
    }
    mock_whisper.return_value = expected

    from backend.pipeline.stage02_transcript import run
    with patch("backend.config.settings.use_gpu", True):
        result = run("abc123xyz", "https://youtube.com/watch?v=abc123xyz")

    assert result["transcript_text"] == SAMPLE_TRANSCRIPT
    assert result["method"] == "faster-whisper"
    assert result["language_detected"] == "hi"
    assert result["word_count"] > 0
    # Audio must be deleted
    assert not mock_audio.exists()


@patch("backend.pipeline.stage02_transcript.cache_get")
def test_cache_hit(mock_cache_get):
    cached = {
        "transcript_text": SAMPLE_TRANSCRIPT,
        "segments": [],
        "language_detected": "hi",
        "language_probability": 0.95,
        "word_count": 40,
        "method": "faster-whisper",
    }
    mock_cache_get.return_value = cached

    from backend.pipeline.stage02_transcript import run
    result = run("cached123", "https://youtube.com/watch?v=cached123")

    assert result is cached
    mock_cache_get.assert_called_once()


@patch("backend.pipeline.stage02_transcript.cache_get", return_value=None)
@patch("backend.pipeline.stage02_transcript.cache_set")
@patch("backend.pipeline.stage02_transcript._transcribe_with_assemblyai")
def test_assemblyai_fallback(mock_assemblyai, mock_cache_set, mock_cache_get):
    expected = {
        "transcript_text": SAMPLE_TRANSCRIPT,
        "segments": [],
        "language_detected": "hi",
        "language_probability": 1.0,
        "word_count": 40,
        "method": "assemblyai",
    }
    mock_assemblyai.return_value = expected

    from backend.pipeline.stage02_transcript import run
    with patch("backend.config.settings.use_gpu", False), \
         patch("backend.config.settings.assemblyai_api_key", "test-key"):
        result = run("fallback123", "https://youtube.com/watch?v=fallback123")

    assert result["method"] == "assemblyai"
    mock_assemblyai.assert_called_once()


def test_no_transcription_available():
    with patch("backend.pipeline.stage02_transcript.cache_get", return_value=None), \
         patch("backend.config.settings.use_gpu", False), \
         patch("backend.config.settings.assemblyai_api_key", ""):
        from backend.pipeline.stage02_transcript import run
        with pytest.raises(RuntimeError, match="No transcription available"):
            run("novid", "https://youtube.com/watch?v=novid")
