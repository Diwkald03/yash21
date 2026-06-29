import uuid
from datetime import datetime
from pydantic import BaseModel, HttpUrl, field_validator


class JobSubmitRequest(BaseModel):
    youtube_url: str

    @field_validator("youtube_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        from backend.utils.validators import is_valid_youtube_url
        if not is_valid_youtube_url(v):
            raise ValueError("Not a valid YouTube URL")
        return v


class JobSubmitResponse(BaseModel):
    job_id: uuid.UUID
    status: str


class JobStatusResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    current_stage: int
    video_title: str | None = None
    draft_url: str | None = None
    error: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class JobListResponse(BaseModel):
    jobs: list[JobStatusResponse]
    total: int
    limit: int
    offset: int


class HealthResponse(BaseModel):
    status: str
    redis: str
    db: str
