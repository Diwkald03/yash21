import re
from urllib.parse import urlparse, parse_qs


_YT_PATTERNS = [
    r"(?:youtube\.com/watch\?.*v=)([A-Za-z0-9_-]{11})",
    r"(?:youtu\.be/)([A-Za-z0-9_-]{11})",
    r"(?:youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
    r"(?:youtube\.com/embed/)([A-Za-z0-9_-]{11})",
]


def extract_video_id(url: str) -> str | None:
    for pattern in _YT_PATTERNS:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def is_valid_youtube_url(url: str) -> bool:
    return extract_video_id(url) is not None
