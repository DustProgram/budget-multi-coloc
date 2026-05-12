"""
Backup mensuel automatique chiffré GPG.

Stratégie :
  - 1er du mois à 03h00 : dump SQLite + archive .tar.gz + chiffrement GPG symétrique
  - Sortie : /backup/budget-YYYY-MM.tar.gz.gpg (inclus dans les snapshots HA)
  - Conservation : 12 derniers backups (rotation)
"""
import asyncio
import logging
import os
import shutil
import subprocess
import tarfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import text

from models.base import SessionLocal, engine
from models import Settings

logger = logging.getLogger(__name__)

BACKUP_DIR = Path("/backup")
MAX_BACKUPS = 12


async def perform_monthly_backup():
    """Tâche programmée : backup mensuel."""
    try:
        backup_path = await asyncio.to_thread(_do_backup)
        if backup_path:
            logger.info(f"✅ Backup mensuel créé : {backup_path}")
            await asyncio.to_thread(_rotate_old_backups)
            await asyncio.to_thread(_update_last_backup_time)
    except Exception as e:
        logger.error(f"❌ Erreur backup mensuel : {e}")


def _do_backup() -> Path | None:
    """Crée le backup chiffré du mois en cours."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m")
    archive_path = BACKUP_DIR / f"budget-{timestamp}.tar.gz"
    encrypted_path = BACKUP_DIR / f"budget-{timestamp}.tar.gz.gpg"

    # 1. Checkpoint SQLite pour fusionner le WAL
    with engine.connect() as conn:
        conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))

    # 2. Localiser le fichier DB
    db_url = os.environ.get("DATABASE_URL", "")
    if "sqlite" not in db_url:
        logger.warning("Backup non supporté pour autre que SQLite")
        return None
    db_path = Path(db_url.split("///")[1].split("?")[0])
    if not db_path.exists():
        logger.warning(f"DB introuvable : {db_path}")
        return None

    # 3. Archive tar.gz
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(db_path, arcname="budget.db")
        # Ajouter aussi les uploads si présents
        uploads_dir = db_path.parent.parent / "uploads"
        if uploads_dir.exists():
            tar.add(uploads_dir, arcname="uploads")

    # 4. Chiffrement GPG symétrique (passphrase via env)
    passphrase = os.environ.get("BACKUP_PASSPHRASE")
    if not passphrase:
        logger.warning("⚠️ Pas de passphrase backup → fichier non chiffré conservé")
        return archive_path

    try:
        subprocess.run(
            [
                "gpg", "--batch", "--yes",
                "--passphrase-fd", "0",
                "--cipher-algo", "AES256",
                "--symmetric",
                "--output", str(encrypted_path),
                str(archive_path),
            ],
            input=passphrase,
            text=True,
            check=True,
            capture_output=True,
        )
        # Supprimer l'archive non chiffrée
        archive_path.unlink()
        return encrypted_path
    except subprocess.CalledProcessError as e:
        logger.error(f"Erreur GPG : {e.stderr}")
        return archive_path


def _rotate_old_backups():
    """Conserve uniquement les MAX_BACKUPS plus récents."""
    backups = sorted(BACKUP_DIR.glob("budget-*.tar.gz*"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in backups[MAX_BACKUPS:]:
        old.unlink()
        logger.info(f"🗑️ Backup supprimé (rotation) : {old.name}")


def _update_last_backup_time():
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        if settings:
            settings.last_backup_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()


def restore_from_backup(backup_file: Path, passphrase: str | None = None) -> bool:
    """Restaure depuis un fichier de backup (à appeler manuellement)."""
    # À implémenter : décryption + remplacement DB
    raise NotImplementedError("Restoration à implémenter en Phase 5")
