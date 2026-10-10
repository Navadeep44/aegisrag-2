"""Application entry point: creates tables, loads demo data on first start,
serves the API and (when built) the frontend.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.config import settings
from app import row_security
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
        row_security.remove_orphans(db)
    yield


app = FastAPI(title="Eyes Only API", lifespan=lifespan)

# Enable CORS for web clients (Render, Vercel, localhost, custom domains)
raw_origins = (getattr(settings, "cors_origins", "*") or "*").strip()
parsed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()] if raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=parsed_origins if "*" not in parsed_origins else ["*"],
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_cors_handler(request: Request, exc: Exception):
    """Guarantees CORS headers are always returned even when an internal server error occurs."""
    origin = request.headers.get("origin") or "*"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc}"},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )

app.include_router(router)
# Handle potential double-prefix from rewrites or VITE_API_BASE_URL ending with /api
app.include_router(router, prefix="/api")

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

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")

