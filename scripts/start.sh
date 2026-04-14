#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – Quick start script
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║       🚀 TELAD FLEET – Starting       ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check .env
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "⚠️  .env not found. Run scripts/init.sh first."
  exit 1
fi

cd "$BACKEND_DIR"
exec node server.js
