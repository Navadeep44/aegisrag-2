from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    # Values come from backend/.env; real environment variables override it.
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    # Empty means: use a local SQLite file (backend/data/aegisrag.db). Nothing to install.
    # Set a postgresql+psycopg:// URL to use Postgres with pgvector instead.
    database_url: str = ""
    file_storage_dir: str = (ENV_FILE.parent / "data" / "files").as_posix()

    jwt_secret: str = "dev-only-change-me"
    jwt_minutes: int = 480

    # Demo conveniences. Turn both off outside a demo.
    demo_mode: bool = True         # one-click login as seeded users
    seed_on_start: bool = True     # load demo data into an empty database
    demo_password: str = "change-me-demo"

    # "local" needs no API key (keyword-style embeddings, extractive answers, no vision).
    # "openai" talks to any OpenAI-compatible API.
    # "gemini" talks directly to Google AI Studio REST API.
    ai_provider: str = "local"
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: str = ""
    ai_chat_model: str = ""
    ai_embed_model: str = ""

    # Google AI Studio (Gemini) Settings
    gemini_api_key: str = ""
    google_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_model: str = "gemini-2.0-flash"
    gemini_embed_model: str = "gemini-embedding-001"
    embed_dim: int = 768

    # Offline OCR (RapidOCR) for scans and images when no vision model answers.
    local_ocr: bool = True

    max_upload_mb: int = 20
    rate_limit_per_minute: int = 20
    retrieval_top_k: int = 6


settings = Settings()
# A relative storage path means "relative to backend/", wherever the server was started from.
if not Path(settings.file_storage_dir).is_absolute():
    settings.file_storage_dir = (ENV_FILE.parent / settings.file_storage_dir).resolve().as_posix()
