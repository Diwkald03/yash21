import asyncio
import logging
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from backend.config import settings

logger = logging.getLogger(__name__)

_BASE = f"{settings.shopify_store_url}/admin/api/2024-01"
_HEADERS = {
    "X-Shopify-Access-Token": settings.shopify_admin_token,
    "Content-Type": "application/json",
}
_RATE_LIMIT_SLEEP = 0.25  # 4 req/sec


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
)
async def _get(path: str, params: dict | None = None) -> dict:
    await asyncio.sleep(_RATE_LIMIT_SLEEP)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{_BASE}{path}", headers=_HEADERS, params=params)
        if resp.status_code == 429:
            logger.warning("Shopify rate limit hit — backing off")
            raise httpx.HTTPStatusError("429", request=resp.request, response=resp)
        resp.raise_for_status()
        return resp.json()


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
)
async def _post(path: str, body: dict) -> dict:
    await asyncio.sleep(_RATE_LIMIT_SLEEP)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{_BASE}{path}", headers=_HEADERS, json=body)
        if resp.status_code == 429:
            logger.warning("Shopify rate limit hit — backing off")
            raise httpx.HTTPStatusError("429", request=resp.request, response=resp)
        resp.raise_for_status()
        return resp.json()


async def search_products(name: str, limit: int = 5) -> list[dict]:
    data = await _get("/products.json", {
        "title": name,
        "fields": "id,title,handle,product_type,images,variants",
        "limit": limit,
    })
    products = []
    for p in data.get("products", []):
        image_src = p["images"][0]["src"] if p.get("images") else ""
        price = p["variants"][0]["price"] if p.get("variants") else "0.00"
        products.append({
            "title": p["title"],
            "handle": p["handle"],
            "product_type": p.get("product_type", ""),
            "image_src": image_src,
            "price": price,
        })
    return products


async def search_collections(name: str, limit: int = 2) -> list[dict]:
    data = await _get("/collections.json", {"title": name, "limit": limit})
    collections = []
    for c in data.get("collections", []):
        collections.append({
            "title": c["title"],
            "handle": c["handle"],
            "url_path": f"/collections/{c['handle']}",
        })
    return collections


async def create_draft_article(
    title: str,
    body_html: str,
    author: str,
    tags: str,
    summary_html: str,
    seo_title: str,
    meta_desc: str,
    image_src: str,
    primary_keyword: str,
) -> dict:
    payload = {
        "article": {
            "title": title,
            "body_html": body_html,
            "author": author,
            "tags": tags,
            "published": False,
            "summary_html": summary_html,
            "metafields": [
                {
                    "namespace": "seo",
                    "key": "title",
                    "value": seo_title,
                    "type": "single_line_text_field",
                },
                {
                    "namespace": "seo",
                    "key": "description",
                    "value": meta_desc,
                    "type": "single_line_text_field",
                },
            ],
            "image": {"src": image_src, "alt": primary_keyword},
        }
    }
    return await _post(f"/blogs/{settings.shopify_blog_id}/articles.json", payload)
