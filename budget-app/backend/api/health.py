"""Endpoint de healthcheck pour le watchdog HA + endpoint /version."""
import os
import re
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

_VERSION_CACHE: dict = {}


def _read_version() -> str:
    if "v" in _VERSION_CACHE:
        return _VERSION_CACHE["v"]
    # Cherche config.yaml en remontant depuis le cwd jusqu'au /app
    candidates = [
        Path("/data/options.json"),  # HA add-on : injecté avec le manifest
        Path("/etc/budget_version"),  # potentiellement écrit par le Dockerfile
        Path(__file__).resolve().parent.parent.parent / "config.yaml",  # local dev
        Path("/app/config.yaml"),
    ]
    for p in candidates:
        try:
            if not p.exists():
                continue
            text = p.read_text(encoding="utf-8")
            m = re.search(r'(?:^|\n)version:\s*"?([^"\n]+)"?', text)
            if m:
                v = m.group(1).strip()
                _VERSION_CACHE["v"] = v
                return v
        except Exception:
            continue
    _VERSION_CACHE["v"] = "dev"
    return "dev"


@router.get("")
async def health():
    return {"status": "ok"}


@router.get("/version")
async def version():
    return {"version": _read_version(), "env": os.environ.get("BUILD_ENV", "prod")}
