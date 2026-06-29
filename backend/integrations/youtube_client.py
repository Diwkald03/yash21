import json
import logging
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def get_video_metadata(youtube_url: str) -> dict:
    """Fetch video metadata without downloading using yt-dlp --dump-json."""
    result = subprocess.run(
        ["yt-dlp", "--dump-json", "--no-download", "--no-playlist", youtube_url],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp metadata error: {result.stderr.strip()}")
    data = json.loads(result.stdout)
    return {
        "video_id": data["id"],
        "title": data.get("title", ""),
        "duration_seconds": data.get("duration", 0),
        "channel": data.get("uploader", ""),
        "thumbnail_url": data.get("thumbnail", ""),
        "description": data.get("description", "")[:500],
    }


def download_audio(youtube_url: str, video_id: str, output_dir: Path) -> Path:
    """Download audio-only stream to output_dir/{video_id}.m4a"""
    output_path = output_dir / f"{video_id}.m4a"
    result = subprocess.run(
        [
            "yt-dlp",
            "--format", "bestaudio[ext=m4a]/bestaudio",
            "--output", str(output_path),
            "--no-playlist",
            "--quiet",
            youtube_url,
        ],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp audio download error: {result.stderr.strip()}")
    if not output_path.exists():
        # yt-dlp may have picked a different extension
        candidates = list(output_dir.glob(f"{video_id}.*"))
        if not candidates:
            raise RuntimeError("Audio file not found after download")
        output_path = candidates[0]
    logger.info("[Audio] Downloaded %s → %s", video_id, output_path)
    return output_path
