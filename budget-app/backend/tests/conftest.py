"""Test-wide configuration.

Set environment variables BEFORE any backend module is imported, so that
modules reading them at import time (DATABASE_URL in models.base, DEV_MODE
in services.auth) pick up the test config.
"""
import os
import tempfile
from pathlib import Path

_db_path = Path(tempfile.gettempdir()) / "budget_test.db"
for suffix in ("", "-wal", "-shm", "-journal"):
    p = Path(str(_db_path) + suffix)
    if p.exists():
        p.unlink()

os.environ["DEV_MODE"] = "true"
os.environ["BACKUP_ENABLED"] = "false"
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}?check_same_thread=False"
