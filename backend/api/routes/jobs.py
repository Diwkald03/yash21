import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.database import get_db
from backend.models.job import Job
from backend.models.schemas import (
    JobSubmitRequest,
    JobSubmitResponse,
    JobStatusResponse,
    JobListResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.post("", response_model=JobSubmitResponse, status_code=202)
async def submit_job(body: JobSubmitRequest, db: AsyncSession = Depends(get_db)):
    job = Job(youtube_url=body.youtube_url, status="pending")
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Enqueue Celery task
    from backend.worker import run_pipeline_task
    run_pipeline_task.delay(str(job.id), body.youtube_url)

    logger.info("[API] Job submitted: job_id=%s", job.id)
    return {"job_id": job.id, "status": job.status}


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    video_title = None
    if job.stage01_output:
        video_title = job.stage01_output.get("title")

    return {
        "job_id": job.id,
        "status": job.status,
        "current_stage": job.current_stage,
        "video_title": video_title,
        "draft_url": job.shopify_draft_url,
        "error": job.error_message,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
    }


@router.get("", response_model=JobListResponse)
async def list_jobs(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count(Job.id)))
    total = count_result.scalar_one()

    result = await db.execute(
        select(Job).order_by(Job.created_at.desc()).limit(limit).offset(offset)
    )
    jobs = result.scalars().all()

    job_list = []
    for job in jobs:
        video_title = job.stage01_output.get("title") if job.stage01_output else None
        job_list.append({
            "job_id": job.id,
            "status": job.status,
            "current_stage": job.current_stage,
            "video_title": video_title,
            "draft_url": job.shopify_draft_url,
            "error": job.error_message,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
        })

    return {"jobs": job_list, "total": total, "limit": limit, "offset": offset}


@router.post("/{job_id}/retry", response_model=JobSubmitResponse)
async def retry_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("failed", "pending"):
        raise HTTPException(status_code=400, detail=f"Cannot retry a job with status '{job.status}'")

    job.status = "pending"
    job.current_stage = 0
    job.error_message = None
    job.retry_count += 1
    await db.commit()

    from backend.worker import run_pipeline_task
    run_pipeline_task.delay(str(job.id), job.youtube_url)

    logger.info("[API] Job retry queued: job_id=%s retry_count=%d", job.id, job.retry_count)
    return {"job_id": job.id, "status": "pending"}
