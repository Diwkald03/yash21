import logging
from backend.config import settings
from backend.integrations.youtube_client import get_video_metadata
from backend.utils.validators import extract_video_id

logger = logging.getLogger(__name__)


def run(youtube_url: str) -> dict:
    """
    Stage 01 — URL Ingestion.
    Validates URL, fetches video metadata, checks duration limit.
    Returns: {video_id, title, duration_seconds, channel, thumbnail_url}
    """
    logger.info("[Stage 01] Starting URL ingestion for: %s", youtube_url)

    video_id = extract_video_id(youtube_url)
    if not video_id:
        raise ValueError(f"Cannot extract video ID from URL: {youtube_url}")

    meta = get_video_metadata(youtube_url)

    max_seconds = settings.max_video_duration_minutes * 60
    if meta["duration_seconds"] > max_seconds:
        raise ValueError(
            f"Video too long: {meta['duration_seconds']}s "
            f"(max {max_seconds}s / {settings.max_video_duration_minutes} min)"
        )

    logger.info(
        "[Stage 01] Done — video_id=%s title=%r duration=%ds",
        meta["video_id"], meta["title"], meta["duration_seconds"],
    )
    return meta
