"""
Stage 07 — Shopify Publish.
Creates a DRAFT blog article via Shopify Admin API.
NEVER auto-publishes — always sets published=False.
"""

import asyncio
import logging
from backend.integrations.shopify_client import create_draft_article

logger = logging.getLogger(__name__)


def run(analysis: dict, seo_data: dict, body_html: str) -> dict:
    logger.info("[Stage 07] Publishing draft to Shopify blog_id=%s", _blog_id_log())

    tags = ", ".join(analysis.get("secondary_keywords", [])[:8])
    primary_keyword = analysis.get("primary_keyword", "DeoDap Product")

    result = asyncio.run(
        create_draft_article(
            title=seo_data["seo_title"],
            body_html=body_html,
            author="DeoDap Team",
            tags=tags,
            summary_html=f"<p>{seo_data['meta_desc']}</p>",
            seo_title=seo_data["seo_title"],
            meta_desc=seo_data["meta_desc"],
            image_src=seo_data.get("featured_image", ""),
            primary_keyword=primary_keyword,
        )
    )

    article = result.get("article", {})
    article_id = article.get("id")
    # Shopify returns the admin URL; construct public draft URL
    draft_url = f"{_store_url()}/admin/articles/{article_id}"

    logger.info(
        "[Stage 07] Draft created — article_id=%s draft_url=%s",
        article_id, draft_url,
    )
    return {
        "article_id": article_id,
        "draft_url": draft_url,
        "status": "draft",
        "shopify_response": article,
    }


def _blog_id_log() -> str:
    from backend.config import settings
    return str(settings.shopify_blog_id)


def _store_url() -> str:
    from backend.config import settings
    return settings.shopify_store_url
