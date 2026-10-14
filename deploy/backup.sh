#!/usr/bin/env bash
# Backup quotidien de la base (snapshot SQLite cohérent, WAL inclus).
# Cron conseillé : 15 3 * * * /opt/budget-multi-coloc/deploy/backup.sh >> /var/log/budget-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"

DEST="${BACKUP_DEST:-/var/backups/budget}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DEST"
chmod 700 "$DEST"

out="$DEST/budget-$(date +%F).db.gz"
docker compose exec -T app python - <<'PY' | gzip > "$out"
import sqlite3, sys
src = sqlite3.connect("/data/db/budget.db")
dst = sqlite3.connect(":memory:")
src.backup(dst)
sys.stdout.buffer.write(dst.serialize())
PY
chmod 600 "$out"
find "$DEST" -name 'budget-*.db.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup OK → $out ($(du -h "$out" | cut -f1))"
