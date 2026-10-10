"""Database engine and session. SQLite by default, PostgreSQL + pgvector when
DATABASE_URL is set. init_db() creates tables and adds any new columns.
"""
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
    import sqlalchemy as sa

    if IS_POSTGRES:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)

    # Automatically add any missing columns for existing tables (e.g. schema updates)
    inspector = sa.inspect(engine)
    with engine.begin() as conn:
        for table_name, table in Base.metadata.tables.items():
            if inspector.has_table(table_name):
                existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
                for col in table.columns:
                    if col.name not in existing_cols:
                        col_type = col.type.compile(engine.dialect)
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}"))


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
