import json
import redis.asyncio as aioredis
from backend.config import settings

_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _pool


async def cache_get(key: str) -> dict | None:
    r = get_redis()
    raw = await r.get(key)
    if raw:
        return json.loads(raw)
    return None


async def cache_set(key: str, value: dict, ttl_seconds: int) -> None:
    r = get_redis()
    await r.setex(key, ttl_seconds, json.dumps(value))


async def cache_delete(key: str) -> None:
    r = get_redis()
    await r.delete(key)
