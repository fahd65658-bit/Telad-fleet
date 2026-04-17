#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
DATA_DIR="${DATA_DIR:-/var/www/telad-fleet/data}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 /absolute/path/to/telad-fleet-data-YYYYMMDDTHHMMSSZ.tar.gz" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ -f "$BACKUP_FILE.sha256" ]]; then
  sha256sum -c "$BACKUP_FILE.sha256"
fi

mkdir -p "$DATA_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT="${DATA_DIR%/}.pre-restore-$STAMP"
STAGING="$(mktemp -d)"

tar -xzf "$BACKUP_FILE" -C "$STAGING"

if find "$DATA_DIR" -mindepth 1 -maxdepth 1 | read -r _; then
  mkdir -p "$SNAPSHOT"
  cp -a "$DATA_DIR"/. "$SNAPSHOT"/
  find "$DATA_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

cp -a "$STAGING"/. "$DATA_DIR"/
rm -rf "$STAGING"

echo "Restore completed into $DATA_DIR"
echo "Previous contents snapshot: $SNAPSHOT"
