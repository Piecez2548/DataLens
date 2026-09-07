"""Vercel ASGI entry point; reuse the same tested profiling API."""
from backend.app.main import app

__all__ = ["app"]
