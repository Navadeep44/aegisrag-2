from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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


app = FastAPI(title="Eyes Only API", lifespan=lifespan)

# Enable CORS for web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Mount frontend build if available for single-service deployments
static_dir = Path(__file__).resolve().parent.parent / "static"
if not (static_dir.exists() and (static_dir / "index.html").exists()):
    static_dir = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if not (static_dir.exists() and (static_dir / "index.html").exists()):
    static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if static_dir.exists() and (static_dir / "index.html").exists():
    if (static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    if (static_dir / "brand").exists():
        app.mount("/brand", StaticFiles(directory=str(static_dir / "brand")), name="brand")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")

