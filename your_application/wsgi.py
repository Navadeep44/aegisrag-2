import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app as asgi_app

try:
    from a2wsgi import ASGIMiddleware
    application = ASGIMiddleware(asgi_app)
except ImportError:
    application = asgi_app

app = application
