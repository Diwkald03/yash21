from fastapi import APIRouter
from backend.models.schemas import HealthResponse

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health():
    redis_status = "ok"
    db_status = "ok"

    try:
        from backend.utils.cache import get_redis
        r = get_redis()
        await r.ping()
    except Exception:
        redis_status = "error"

    try:
        from backend.db.database import engine
        async with engine.connect() as conn:
            await conn.execute(engine.dialect.statement_compiler(conn, "SELECT 1"))
    except Exception:
        db_status = "error"

    return {"status": "ok", "redis": redis_status, "db": db_status}
