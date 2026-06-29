import uuid
from datetime import datetime
from sqlalchemy import String, SmallInteger, Text, BigInteger, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from backend.db.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    youtube_url: Mapped[str] = mapped_column(Text, nullable=False)
    video_id: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    current_stage: Mapped[int] = mapped_column(SmallInteger, default=0)
    retry_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)

    stage01_output: Mapped[dict | None] = mapped_column(JSONB)
    stage02_output: Mapped[dict | None] = mapped_column(JSONB)
    stage03_output: Mapped[dict | None] = mapped_column(JSONB)
    stage04_output: Mapped[dict | None] = mapped_column(JSONB)
    stage05_output: Mapped[dict | None] = mapped_column(JSONB)
    stage06_output: Mapped[dict | None] = mapped_column(JSONB)
    stage07_output: Mapped[dict | None] = mapped_column(JSONB)

    shopify_article_id: Mapped[int | None] = mapped_column(BigInteger)
    shopify_draft_url: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
