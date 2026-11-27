#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
POSTGRES_USER="${POSTGRES_USER:-crm}"
POSTGRES_DB="${POSTGRES_DB:-crm}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/crm-$STAMP.dump"
BACKUP_STATUS_FILE="${BACKUP_STATUS_FILE:-$BACKUP_DIR/last-backup.json}"

write_status() {
  mkdir -p "$(dirname "$BACKUP_STATUS_FILE")"
  printf '{"status":"%s","at":"%s"}\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_STATUS_FILE"
}

trap 'write_status failed' ERR

mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$FILE"

find "$BACKUP_DIR" -type f -name 'crm-*.dump' -mtime +"$RETENTION_DAYS" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE"
fi

write_status ok
echo "Backup concluído: $FILE"
