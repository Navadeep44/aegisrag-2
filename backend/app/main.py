from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import router
from app.config import settings
from app.db import SessionLocal, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if settings.seed_on_start:
        from app.seed import seed_if_empty

        with SessionLocal() as db:
            seed_if_empty(db)
    from app.reindex import migrate_legacy_section_rules
    with SessionLocal() as db:
        migrate_legacy_section_rules(db)
    yield


app = FastAPI(title="AegisRAG API", lifespan=lifespan)
app.include_router(router)
