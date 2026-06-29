"""
Stage 04 — Shopify Data Fetch.
Queries Shopify for products and collections extracted in Stage 03.
Caches results for 24h to minimise API calls.
"""

import asyncio
import logging
from backend.integrations.shopify_client import search_products, search_collections
from backend.utils.cache import cache_get, cache_set
from backend.config import settings

logger = logging.getLogger(__name__)

_PRODUCT_CACHE_KEY = "shopify:product:{}"
_COLLECTION_CACHE_KEY = "shopify:collection:{}"
_CACHE_TTL = 24 * 3600  # 24 hours


async def _fetch_product(name: str) -> list[dict]:
    cache_key = _PRODUCT_CACHE_KEY.format(name.lower().replace(" ", "-"))
    cached = await cache_get(cache_key)
    if cached:
        logger.info("[Stage 04] Product cache hit: %r", name)
        return cached
    results = await search_products(name, limit=3)
    if results:
        await cache_set(cache_key, results, _CACHE_TTL)
    return results


async def _fetch_collection(name: str) -> list[dict]:
    cache_key = _COLLECTION_CACHE_KEY.format(name.lower().replace(" ", "-"))
    cached = await cache_get(cache_key)
    if cached:
        logger.info("[Stage 04] Collection cache hit: %r", name)
        return cached
    results = await search_collections(name, limit=2)
    if results:
        await cache_set(cache_key, results, _CACHE_TTL)
    return results


async def _fetch_all(analysis: dict) -> dict:
    product_names = analysis.get("products", [])[:5]
    collection_names = analysis.get("collections", [])[:3]

    # Fetch all in parallel
    product_tasks = [_fetch_product(name) for name in product_names]
    collection_tasks = [_fetch_collection(name) for name in collection_names]

    product_results, collection_results = await asyncio.gather(
        asyncio.gather(*product_tasks),
        asyncio.gather(*collection_tasks),
    )

    # Flatten and deduplicate by handle
    seen_handles: set[str] = set()
    products = []
    for result_list in product_results:
        for p in result_list:
            if p["handle"] not in seen_handles:
                seen_handles.add(p["handle"])
                products.append(p)

    seen_coll: set[str] = set()
    collections = []
    for result_list in collection_results:
        for c in result_list:
            if c["handle"] not in seen_coll:
                seen_coll.add(c["handle"])
                collections.append(c)

    logger.info(
        "[Stage 04] Fetched %d products, %d collections",
        len(products), len(collections),
    )
    return {"shopify_products": products, "collections": collections}


def run(analysis: dict) -> dict:
    logger.info("[Stage 04] Starting Shopify data fetch")
    result = asyncio.run(_fetch_all(analysis))
    return result
