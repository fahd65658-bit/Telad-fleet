#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – Initialization script
# Run once to set up the project for the first time
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
ENV_FILE="$BACKEND_DIR/.env"
ENV_EXAMPLE="$BACKEND_DIR/.env.example"

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║    🚀 TELAD FLEET – Initialization    ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# 1. Generate .env if missing
if [ ! -f "$ENV_FILE" ]; then
  echo "📋 Creating .env from .env.example ..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  # Generate secrets using openssl
  JWT_SECRET=$(openssl rand -hex 64)
  JWT_REFRESH_SECRET=$(openssl rand -hex 64)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  SIGNING_KEY=$(openssl rand -hex 32)
  DB_PASS=$(openssl rand -base64 20 | tr -d '/+=')

  # Portable sed: macOS requires '' after -i, Linux does not
  SED_I="sed -i"
  if sed --version 2>/dev/null | grep -q GNU; then
    SED_I="sed -i"
  else
    SED_I="sed -i ''"
  fi

  # Replace placeholder values
  $SED_I "s|CHANGE_THIS_TO_64_CHAR_RANDOM_HEX_openssl_rand_hex_64|$JWT_SECRET|g"      "$ENV_FILE"
  $SED_I "s|CHANGE_THIS_TO_ANOTHER_64_CHAR_RANDOM_HEX|$JWT_REFRESH_SECRET|g"          "$ENV_FILE"
  $SED_I "s|CHANGE_THIS_TO_32_CHAR_HEX_KEY|$ENCRYPTION_KEY|g"                         "$ENV_FILE"
  $SED_I "s|CHANGE_THIS_TO_STRONG_PASSWORD_20_CHARS|$DB_PASS|g"                        "$ENV_FILE"

  echo "  ✅ .env created with generated secrets"
else
  echo "  ℹ️  .env already exists — skipping generation"
fi

# 2. Install backend dependencies
echo ""
echo "📦 Installing backend dependencies ..."
cd "$BACKEND_DIR"
npm install --loglevel=error
echo "  ✅ Backend dependencies installed"

# 3. Validate server.js syntax
echo ""
echo "🔍 Validating server syntax ..."
node --check server.js
echo "  ✅ server.js syntax OK"

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   ✅ Initialization complete!         ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "  Start the server:  cd backend && npm start"
echo "  Run API tests:     node tests/test-api.js"
echo ""
