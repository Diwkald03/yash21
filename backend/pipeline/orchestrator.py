"""
Pipeline orchestrator — chains Stages 01-07 sequentially.
Updates job state in PostgreSQL after each stage.
On failure: marks job FAILED and surfaces error_message.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from sqlalchemy import update
from backend.db.database import AsyncSessionLocal
from backend.models.job import Job
from backend import pipeline

logger = logging.getLogger(__name__)

# Import stages
from backend.pipeline import (
    stage01_ingest,
    stage02_transcript,
    stage03_analysis,
    stage04_shopify_fetch,
    stage05_blog_gen,
    stage06_seo_builder,
    stage07_publish,
)


async def _update_job(job_id: uuid.UUID, **kwargs) -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(Job).where(Job.id == job_id).values(**kwargs)
        )
        await session.commit()


def run_pipeline(job_id_str: str, youtube_url: str) -> None:
    """
    Main Celery task entry point. Runs all 7 stages sequentially.
    job_id_str is a string UUID; convert it here.
    """
    job_id = uuid.UUID(job_id_str)
    logger.info("[Orchestrator] Starting pipeline for job_id=%s url=%s", job_id, youtube_url)

    stages = [
        ("01", "URL ingestion"),
        ("02", "Transcript extraction"),
        ("03", "AI content analysis"),
        ("04", "Shopify data fetch"),
        ("05", "Blog generation"),
        ("06", "SEO & schema builder"),
        ("07", "Shopify publish"),
    ]

    try:
        # ── Stage 01: URL Ingestion ──────────────────────────────────────────
        asyncio.run(_update_job(job_id, status="processing", current_stage=1))
        stage01 = stage01_ingest.run(youtube_url)
        asyncio.run(_update_job(job_id, stage01_output=stage01, video_id=stage01["video_id"]))

        video_id = stage01["video_id"]

        # ── Stage 02: Transcript ─────────────────────────────────────────────
        asyncio.run(_update_job(job_id, current_stage=2))
        stage02 = stage02_transcript.run(video_id, youtube_url)
        asyncio.run(_update_job(job_id, stage02_output=stage02))

        # ── Stage 03: AI Analysis ─────────────────────────────────────────────
        asyncio.run(_update_job(job_id, current_stage=3))
        stage03 = stage03_analysis.run(stage02["transcript_text"])
        asyncio.run(_update_job(job_id, stage03_output=stage03))

        # ── Stage 04: Shopify Data Fetch ─────────────────────────────────────
        asyncio.run(_update_job(job_id, current_stage=4))
        stage04 = stage04_shopify_fetch.run(stage03)
        asyncio.run(_update_job(job_id, stage04_output=stage04))

        # ── Stage 05: Blog Generation ─────────────────────────────────────────
        asyncio.run(_update_job(job_id, current_stage=5))
        stage05 = stage05_blog_gen.run(stage03, stage04)
        asyncio.run(_update_job(job_id, stage05_output=stage05))

        # ── Stage 06: SEO & Schema ────────────────────────────────────────────
        asyncio.run(_update_job(job_id, current_stage=6))
        stage06 = stage06_seo_builder.run(stage03, stage04, stage05["body_html"])
        asyncio.run(_update_job(job_id, stage06_output=stage06))

        # ── Stage 07: Shopify Publish ─────────────────────────────────────────
        asyncio.run(_update_job(job_id, current_stage=7))
        stage07 = stage07_publish.run(stage03, stage06, stage05["body_html"])
        asyncio.run(_update_job(
            job_id,
            stage07_output=stage07,
            shopify_article_id=stage07["article_id"],
            shopify_draft_url=stage07["draft_url"],
            status="completed",
            current_stage=7,
            completed_at=datetime.now(timezone.utc),
        ))

        logger.info(
            "[Orchestrator] Pipeline complete job_id=%s draft_url=%s",
            job_id, stage07["draft_url"],
        )

    except Exception as exc:
        logger.exception("[Orchestrator] Pipeline FAILED job_id=%s: %s", job_id, exc)
        asyncio.run(_update_job(
            job_id,
            status="failed",
            error_message=str(exc)[:2000],
        ))
        raise
