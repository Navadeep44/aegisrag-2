from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
if settings.database_url:
    DATABASE_URL = settings.database_url
else:
    DATA_DIR.mkdir(exist_ok=True)
    DATABASE_URL = f"sqlite:///{(DATA_DIR / 'aegisrag.db').as_posix()}"

IS_POSTGRES = DATABASE_URL.startswith("postgresql")
IS_SQLITE = not IS_POSTGRES
engine = create_engine(
    DATABASE_URL, pool_pre_ping=True,
    **({} if IS_POSTGRES else {"connect_args": {"check_same_thread": False, "timeout": 30}}),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.models import Base

    if IS_POSTGRES:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)


def database_status() -> dict:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            if IS_SQLITE:
                return {"database": "up", "engine": "sqlite"}
            has_vector = conn.execute(
                text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
            ).first()
        return {"database": "up", "engine": "postgres", "pgvector": bool(has_vector)}
    except Exception:
        return {"database": "down"}
