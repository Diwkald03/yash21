"""
Stage 05 — Blog Generation (claude-opus-4-6).
Writes a full SEO HTML blog post (800-1200 words) using the analysis and Shopify data.
"""

import logging
from backend.integrations.anthropic_client import call_claude

logger = logging.getLogger(__name__)

_SYSTEM = """You are an expert SEO content writer for DeoDap, an Indian kitchenware
and home goods brand. Write in a helpful, conversational tone that feels natural to
Indian readers. Reference Indian kitchen, home, and festival contexts naturally.
Never copy transcript text — always paraphrase and expand. Never use hollow superlatives
like "best in India" or "number 1" without specific evidence. CTAs should be
action-oriented but not pushy ("Check it out" over "Buy Now!!").
Output raw HTML only — no markdown, no explanation."""

_BLOG_PROMPT_TEMPLATE = """Write a complete SEO blog post for DeoDap using the
information below. Output ONLY valid HTML. No markdown, no code fences.

=== VIDEO ANALYSIS ===
Topic: {topic}
Problem Solved: {problem_solved}
Search Intent: {intent}
Buying Intent: {buying_intent}
Target Audience: {target_audience}
Primary Keyword: {primary_keyword}
Secondary Keywords: {secondary_keywords}
Key Points: {key_points}

=== SHOPIFY PRODUCTS ===
{products_block}

=== SHOPIFY COLLECTIONS ===
{collections_block}

=== REQUIREMENTS ===
- Word count: 800-1200 words (body text, not counting HTML tags)
- Primary keyword density: 1-2%
- Structure: <h1> → intro <p> → 3-5 <h2> sections → product section → FAQ → CTA block
- Each product gets: <img> with keyword alt text + <h3> linked to product page + 2-sentence description
- Product links: https://deodap.in/products/{{handle}}
- Collection links: https://deodap.in{{url_path}}
- Minimum 2 internal product links, 1 collection link
- FAQ: 3 relevant Q&A pairs as <dl><dt>question</dt><dd>answer</dd></dl>
- CTA block: class="cta-block" with compelling text + collection link button
- If buying intent is HIGH: lead with product CTA after intro
- If buying intent is LOW: educate fully before CTA
- Include <meta> tags as HTML comments at the TOP of output:
  <!-- SEO_TITLE: your title here -->
  <!-- META_DESC: your description here -->
  <!-- URL_SLUG: your-slug-here -->

Begin writing the blog post HTML now."""


def _build_products_block(products: list[dict]) -> str:
    if not products:
        return "No specific products available — write generically about the category."
    lines = []
    for p in products:
        lines.append(
            f"- Title: {p['title']} | Handle: {p['handle']} "
            f"| Price: ₹{p.get('price', 'N/A')} | Image: {p.get('image_src', '')}"
        )
    return "\n".join(lines)


def _build_collections_block(collections: list[dict]) -> str:
    if not collections:
        return "No specific collections available."
    lines = []
    for c in collections:
        lines.append(f"- Title: {c['title']} | URL Path: {c['url_path']}")
    return "\n".join(lines)


def run(analysis: dict, shopify_data: dict) -> dict:
    logger.info("[Stage 05] Starting blog generation with claude-opus-4-6")

    products = shopify_data.get("shopify_products", [])
    collections = shopify_data.get("collections", [])

    prompt = _BLOG_PROMPT_TEMPLATE.format(
        topic=analysis.get("topic", ""),
        problem_solved=analysis.get("problem_solved", ""),
        intent=analysis.get("intent", "informational"),
        buying_intent=analysis.get("buying_intent", "medium"),
        target_audience=analysis.get("target_audience", "Indian home shoppers"),
        primary_keyword=analysis.get("primary_keyword", ""),
        secondary_keywords=", ".join(analysis.get("secondary_keywords", [])),
        key_points="\n".join(f"- {kp}" for kp in analysis.get("key_points", [])),
        products_block=_build_products_block(products),
        collections_block=_build_collections_block(collections),
    )

    body_html = call_claude(
        system=_SYSTEM,
        prompt=prompt,
        model="claude-opus-4-6",
        max_tokens=8192,
    )

    word_count = len(body_html.replace("<", " <").replace(">", "> ").split())
    logger.info("[Stage 05] Blog generated — approx %d words (raw HTML chars=%d)", word_count, len(body_html))

    return {"body_html": body_html, "word_count_approx": word_count}
