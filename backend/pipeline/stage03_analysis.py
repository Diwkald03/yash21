"""
Stage 03 — AI Content Analysis (claude-sonnet-4-6).
Extracts topic, intent, products, keywords, buying signals from transcript.
"""

import json
import logging
from backend.integrations.anthropic_client import call_claude

logger = logging.getLogger(__name__)

_MAX_TRANSCRIPT_CHARS = 50_000

_SYSTEM = """You are a content strategist for DeoDap, an Indian B2B wholesale company
selling kitchenware, home goods, gadgets, and toys. Videos are in Hindi/Hinglish.
Your job is to extract precise commercial signals from video transcripts to power
SEO blog content. Always respond with valid JSON only."""

_PROMPT_TEMPLATE = """Analyze this YouTube transcript from a DeoDap product video.
Return ONLY valid JSON — no markdown, no backticks, no explanation.

{{
  "topic": "1-2 sentence summary of what this video covers",
  "intent": "informational|commercial|transactional",
  "buying_intent": "low|medium|high",
  "target_audience": "description of who this video is for",
  "problem_solved": "the customer pain point the video addresses",
  "products": ["up to 5 specific product names or types mentioned"],
  "collections": ["up to 3 Shopify collection/category names relevant to content"],
  "primary_keyword": "single best English SEO keyword for this content",
  "secondary_keywords": ["5 to 7 supporting English long-tail keywords"],
  "key_points": ["4 to 6 main talking points from the video"]
}}

Transcript:
{transcript_text}"""

_REPAIR_PROMPT = """The previous response was not valid JSON.
Fix it and return ONLY valid JSON matching this schema exactly:
{{topic, intent, buying_intent, target_audience, problem_solved,
products[], collections[], primary_keyword, secondary_keywords[], key_points[]}}

Previous response:
{bad_response}"""


def run(transcript_text: str) -> dict:
    logger.info("[Stage 03] Starting AI content analysis (len=%d chars)", len(transcript_text))

    # Truncate if too long
    if len(transcript_text) > _MAX_TRANSCRIPT_CHARS:
        logger.warning(
            "[Stage 03] Transcript truncated from %d to %d chars",
            len(transcript_text), _MAX_TRANSCRIPT_CHARS,
        )
        transcript_text = transcript_text[:_MAX_TRANSCRIPT_CHARS]

    prompt = _PROMPT_TEMPLATE.format(transcript_text=transcript_text)
    response = call_claude(system=_SYSTEM, prompt=prompt, model="claude-sonnet-4-6")

    try:
        result = json.loads(response)
    except json.JSONDecodeError:
        logger.warning("[Stage 03] JSON parse failed — sending repair prompt")
        repair = _REPAIR_PROMPT.format(bad_response=response[:3000])
        response2 = call_claude(system=_SYSTEM, prompt=repair, model="claude-sonnet-4-6")
        result = json.loads(response2)

    logger.info(
        "[Stage 03] Done — topic=%r intent=%s products=%s keywords=%s",
        result.get("topic", "")[:60],
        result.get("intent"),
        result.get("products"),
        result.get("primary_keyword"),
    )
    return result
