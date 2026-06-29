from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Anthropic
    anthropic_api_key: str = ""

    # Shopify
    shopify_store_url: str = ""
    shopify_admin_token: str = ""
    shopify_blog_id: int = 0

    # Database
    database_url: str = "postgresql+asyncpg://deodap:password@localhost:5432/yt_blog"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Transcription
    assemblyai_api_key: str = ""
    whisper_model: str = "large-v3"
    use_gpu: bool = False

    # App
    environment: str = "development"
    max_video_duration_minutes: int = 60
    transcript_cache_ttl_hours: int = 24


settings = Settings()
