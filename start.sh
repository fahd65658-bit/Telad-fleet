#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – local development start script
# Starts the Node.js backend from backend/ on port 5000.
# Copy backend/.env.example to backend/.env before first run.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Install backend dependencies if missing
if [ ! -d "$REPO_ROOT/backend/node_modules" ]; then
  echo "[setup] Installing backend dependencies..."
  cd "$REPO_ROOT/backend" && npm install
fi

# Create backend/.env from example if not present
if [ ! -f "$REPO_ROOT/backend/.env" ]; then
  echo "[setup] Creating backend/.env from .env.example"
  cp "$REPO_ROOT/backend/.env.example" "$REPO_ROOT/backend/.env"
  echo "[setup] ⚠️  Edit backend/.env and set JWT_SECRET before production use!"
fi

cd "$REPO_ROOT/backend"
exec node server.js
