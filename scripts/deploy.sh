#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – Production deployment script
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
DEPLOY_ENV="${DEPLOY_ENV:-production}"

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║     🚀 TELAD FLEET – Deployment       ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "  Environment: $DEPLOY_ENV"
echo ""

# 1. Check required env vars
check_env() {
  for var in JWT_SECRET JWT_REFRESH_SECRET DB_PASS; do
    if [ -z "${!var:-}" ]; then
      echo "❌ Missing required env var: $var"
      exit 1
    fi
  done
  echo "  ✅ Environment variables OK"
}

# 2. Install production deps
install_deps() {
  echo "📦 Installing production dependencies ..."
  cd "$BACKEND_DIR"
  npm ci --only=production --loglevel=error
  echo "  ✅ Dependencies installed"
}

# 3. Validate syntax
validate() {
  echo "🔍 Validating source files ..."
  node --check "$BACKEND_DIR/server.js"
  echo "  ✅ Syntax OK"
}

# 4. Start with pm2 (if available)
start_server() {
  if command -v pm2 &>/dev/null; then
    echo "🔄 Starting with PM2 ..."
    cd "$BACKEND_DIR"
    pm2 start server.js --name telad-fleet-backend \
      --max-memory-restart 500M \
      --restart-delay 3000 \
      --time \
      || pm2 restart telad-fleet-backend
    pm2 save
    echo "  ✅ PM2 started"
  else
    echo "⚠️  PM2 not found. Starting with node ..."
    cd "$BACKEND_DIR"
    NODE_ENV=production node server.js &
    echo "  ✅ Server started (PID $!)"
  fi
}

check_env
install_deps
validate
start_server

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   ✅ Deployment complete!             ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "  Health: http://localhost:${PORT:-5000}/health"
echo ""
