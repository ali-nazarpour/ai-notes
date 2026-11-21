"""Application settings, loaded from environment variables (and an optional .env file)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    # Used in links inside emails (invites, password resets); can be changed in the admin panel.
    app_url: str = "http://localhost:5173"
    # Encrypts stored secrets (the SMTP password). Set a long random value in production.
    app_secret_key: str = ""
    # Comma-separated emails that become admins when they sign up.
    admin_emails: str = ""

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:4b"
    ollama_timeout_seconds: float = 300.0
    ollama_temperature: float = 0.1
    ollama_num_ctx: int = 8192

    # AI limits. The character budget must fit inside ollama_num_ctx together with the
    # instructions, the question and the answer (see docs/ai.md).
    ai_context_char_budget: int = 12_000
    ai_max_question_chars: int = 2_000
    ai_max_edit_chars: int = 12_000
    ai_history_messages: int = 6
    ai_summary_max_chunks: int = 8

    # Notes
    note_max_chars: int = 2_000_000
    note_max_body_bytes: int = 8_000_000

    # Object storage (MinIO / any S3-compatible service)
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "notes-files"
    minio_secure: bool = False
    upload_max_image_bytes: int = 20 * 1024 * 1024
    upload_max_video_bytes: int = 500 * 1024 * 1024
    upload_max_audio_bytes: int = 100 * 1024 * 1024
    upload_max_file_bytes: int = 100 * 1024 * 1024
    # Backup import: total uncompressed size and number of entries in the ZIP.
    import_max_bytes: int = 2 * 1024 * 1024 * 1024
    import_max_entries: int = 50_000

    # Link previews (bookmark blocks)
    link_preview_timeout_seconds: float = 6.0
    link_preview_max_bytes: int = 512 * 1024

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # database_url comes from the environment
