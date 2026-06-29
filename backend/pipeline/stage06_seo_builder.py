"""
Stage 06 — SEO & Schema Builder.
Deterministically generates SEO title, meta description, URL slug,
FAQ JSON-LD schema, and Article JSON-LD schema from the blog HTML.
"""

import json
import logging
import re
from datetime import datetime, timezone
from slugify import slugify

logger = logging.getLogger(__name__)


def _extract_meta_comments(body_html: str) -> dict:
    """Parse <!-- SEO_TITLE: ... --> style comments embedded by the blog writer."""
    meta: dict = {}
    for key in ("SEO_TITLE", "META_DESC", "URL_SLUG"):
        pattern = rf"<!--\s*{key}:\s*(.*?)\s*-->"
        match = re.search(pattern, body_html, re.IGNORECASE)
        if match:
            meta[key] = match.group(1).strip()
    return meta


def _extract_faq_pairs(body_html: str) -> list[tuple[str, str]]:
    """Extract Q&A pairs from <dl><dt>question</dt><dd>answer</dd></dl>."""
    pairs = []
    dl_match = re.search(r"<dl>(.*?)</dl>", body_html, re.DOTALL | re.IGNORECASE)
    if dl_match:
        dl_content = dl_match.group(1)
        questions = re.findall(r"<dt>(.*?)</dt>", dl_content, re.DOTALL)
        answers = re.findall(r"<dd>(.*?)</dd>", dl_content, re.DOTALL)
        for q, a in zip(questions, answers):
            clean_q = re.sub(r"<[^>]+>", "", q).strip()
            clean_a = re.sub(r"<[^>]+>", "", a).strip()
            if clean_q and clean_a:
                pairs.append((clean_q, clean_a))
    return pairs[:5]  # max 5


def run(analysis: dict, shopify_data: dict, body_html: str) -> dict:
    logger.info("[Stage 06] Building SEO metadata and schema")

    primary_kw = analysis.get("primary_keyword", "")
    meta_comments = _extract_meta_comments(body_html)

    # SEO title
    seo_title = meta_comments.get("SEO_TITLE") or f"{primary_kw.title()} | DeoDap"
    if len(seo_title) > 60:
        seo_title = seo_title[:57] + "..."

    # Meta description
    meta_desc = (
        meta_comments.get("META_DESC")
        or f"Explore the best {primary_kw} for your home. "
           f"Quality products at wholesale prices from DeoDap — India's trusted home goods brand."
    )
    meta_desc = meta_desc[:155]

    # URL slug
    slug = meta_comments.get("URL_SLUG") or slugify(f"{primary_kw}-deodap")

    # FAQ schema
    faq_pairs = _extract_faq_pairs(body_html)
    faq_schema: dict = {}
    if faq_pairs:
        faq_schema = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
                for q, a in faq_pairs
            ],
        }

    # Featured image (first product image)
    products = shopify_data.get("shopify_products", [])
    featured_image = products[0]["image_src"] if products else ""

    # Article schema
    article_schema = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": seo_title,
        "author": {"@type": "Organization", "name": "DeoDap"},
        "publisher": {
            "@type": "Organization",
            "name": "DeoDap",
            "logo": {
                "@type": "ImageObject",
                "url": "https://deodap.in/logo.png",
            },
        },
        "image": featured_image,
        "datePublished": datetime.now(timezone.utc).isoformat(),
    }

    # Open Graph
    og_tags = {
        "og:title": seo_title,
        "og:description": meta_desc,
        "og:image": featured_image,
        "og:type": "article",
    }

    result = {
        "seo_title": seo_title,
        "meta_desc": meta_desc,
        "slug": slug,
        "faq_schema": faq_schema,
        "article_schema": article_schema,
        "og_tags": og_tags,
        "featured_image": featured_image,
    }

    logger.info("[Stage 06] Done — seo_title=%r slug=%r faqs=%d", seo_title, slug, len(faq_pairs))
    return result
