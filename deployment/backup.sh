#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/www/telad-fleet/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/telad-fleet}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "DATA_DIR not found: $DATA_DIR" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/telad-fleet-data-$STAMP.tar.gz"

tar -C "$DATA_DIR" -czf "$ARCHIVE" .
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"

find "$BACKUP_DIR" -type f -name 'telad-fleet-data-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'telad-fleet-data-*.tar.gz.sha256' -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $ARCHIVE"
