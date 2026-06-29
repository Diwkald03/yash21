"""Celery worker entry point."""
from celery import Celery
from backend.config import settings

celery_app = Celery(
    "deodap_yt_blog",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,  # one task at a time per worker process
)


@celery_app.task(name="run_pipeline", bind=True, max_retries=3, default_retry_delay=10)
def run_pipeline_task(self, job_id: str, youtube_url: str) -> dict:
    from backend.pipeline.orchestrator import run_pipeline
    try:
        run_pipeline(job_id, youtube_url)
        return {"status": "completed", "job_id": job_id}
    except Exception as exc:
        raise self.retry(exc=exc)
