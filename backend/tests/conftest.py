"""Tests run against a separate test database with the local AI
provider, so they need no API key and never touch live data."""
import json
import tempfile
import time
from pathlib import Path

from sqlalchemy import create_engine, text

from app.config import settings  # noqa: E402  (reads backend/.env)

BASE_URL = settings.database_url or "sqlite://"  # empty means the default SQLite file
if BASE_URL.startswith("sqlite"):
    TEST_URL = f"sqlite:///{tempfile.mkdtemp(prefix='aegis_testdb_')}/test.db"
else:
    TEST_URL = BASE_URL if BASE_URL.endswith("_test") else BASE_URL + "_test"
    _name = TEST_URL.rsplit("/", 1)[1]
    with create_engine(BASE_URL, isolation_level="AUTOCOMMIT").connect() as conn:
        if not conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": _name}).first():
            conn.execute(text(f'CREATE DATABASE "{_name}"'))

# Point the app at the test database before any other app module is imported.
settings.database_url = TEST_URL
settings.ai_provider = "local"
settings.file_storage_dir = tempfile.mkdtemp(prefix="aegis_test_")
settings.demo_mode = False
settings.seed_on_start = False
settings.rate_limit_per_minute = 1000
settings.demo_password = "test-only-password"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.seed import seed  # noqa: E402

REPORT = Path(__file__).resolve().parent.parent / "reports" / "latest.json"
_titles: dict[str, str] = {}
_results: list[dict] = []


@pytest.fixture(scope="session")
def client():
    Base.metadata.drop_all(engine)
    init_db()
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def db(client):
    with SessionLocal() as session:
        yield session


@pytest.fixture(scope="session")
def login(client):
    cache: dict[str, dict] = {}

    def _login(email: str) -> dict:
        if email not in cache:
            response = client.post("/api/auth/login",
                                   json={"email": email, "password": "test-only-password"})
            assert response.status_code == 200
            cache[email] = {"Authorization": f"Bearer {response.json()['token']}"}
        return cache[email]

    return _login


def pytest_collection_modifyitems(items):
    for item in items:
        doc = (item.function.__doc__ or item.name).strip().splitlines()[0]
        _titles[item.nodeid] = doc


def pytest_runtest_logreport(report):
    if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
        _results.append({"id": report.nodeid, "title": _titles.get(report.nodeid, report.nodeid),
                         "group": "security" if any(k in report.nodeid for k in ("test_security", "test_row_level", "test_section_access")) else "unit",
                         "outcome": report.outcome, "seconds": round(report.duration, 2)})


def pytest_sessionfinish(session):
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps({
        "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "passed": sum(r["outcome"] == "passed" for r in _results),
        "failed": sum(r["outcome"] != "passed" for r in _results),
        "tests": _results,
    }, indent=2))
