#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – One-Command VPS Deploy Script
#
# Prerequisites:
#   • Ubuntu 22.04+ VPS with root access
#   • Domain DNS already pointing fna.sa, www.fna.sa, api.fna.sa → server IP
#   • Git installed (apt install git)
#
# Usage:
#   git clone https://github.com/fahd65658-bit/Telad-fleet /var/www/telad-fleet
#   cd /var/www/telad-fleet
#   chmod +x deployment/deploy.sh
#   sudo bash deployment/deploy.sh
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

DEPLOY_DIR="/var/www/telad-fleet"
ADMIN_EMAIL="admin@fna.sa"
DOMAIN_FRONTEND="fna.sa"
DOMAIN_WWW="www.fna.sa"
DOMAIN_API="api.fna.sa"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║    🚀  TELAD FLEET – Deploy Script       ║"
echo "║    Domain: fna.sa                        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── 1. System packages ──────────────────────────────────────────────────────
log "Updating system packages…"
apt-get update -qq
apt-get install -y -qq curl git nginx ufw

# ─── 2. Node.js 20 ───────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]]; then
  log "Installing Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
log "Node.js $(node -v) ready"

# ─── 3. PM2 ──────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2…"
  npm install -g pm2 --silent
fi
log "PM2 $(pm2 -v) ready"

# ─── 4. Certbot ──────────────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  log "Installing Certbot…"
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# ─── 5. Deploy directory ─────────────────────────────────────────────────────
log "Preparing deploy directory: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/logs"

# ─── 6. Backend dependencies ─────────────────────────────────────────────────
log "Installing backend dependencies…"
cd "$DEPLOY_DIR/backend"
npm ci --omit=dev

# ─── 7. .env from example (if not already set) ───────────────────────────────
if [[ ! -f "$DEPLOY_DIR/backend/.env" ]]; then
  warn ".env not found — copying from .env.example"
  cp "$DEPLOY_DIR/backend/.env.example" "$DEPLOY_DIR/backend/.env"
  warn "⚠️  IMPORTANT: Edit $DEPLOY_DIR/backend/.env and set JWT_SECRET before going live!"
fi

# ─── 8. nginx config ─────────────────────────────────────────────────────────
log "Configuring nginx…"
cp "$DEPLOY_DIR/deployment/nginx.conf" /etc/nginx/sites-available/telad-fleet
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/telad-fleet /etc/nginx/sites-enabled/telad-fleet

# Test config before reloading
nginx -t
systemctl reload nginx
log "nginx configured and reloaded"

# ─── 9. Firewall ─────────────────────────────────────────────────────────────
log "Configuring UFW firewall…"
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
log "Firewall: OpenSSH + Nginx Full allowed"

# ─── 10. SSL with Let's Encrypt ──────────────────────────────────────────────
log "Obtaining SSL certificate for $DOMAIN_FRONTEND, $DOMAIN_WWW, $DOMAIN_API…"
certbot --nginx \
  -d "$DOMAIN_FRONTEND" \
  -d "$DOMAIN_WWW" \
  -d "$DOMAIN_API" \
  --non-interactive \
  --agree-tos \
  --email "$ADMIN_EMAIL" \
  --redirect \
  || warn "Certbot failed — ensure DNS is pointed to this server and try: certbot --nginx -d fna.sa -d www.fna.sa -d api.fna.sa"

# ─── 11. PM2 start ───────────────────────────────────────────────────────────
log "Starting TELAD FLEET with PM2…"
cd "$DEPLOY_DIR"
pm2 delete telad-fleet 2>/dev/null || true
pm2 start deployment/pm2.config.js --env production
pm2 save

# Configure PM2 to auto-start on reboot
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# ─── 12. Reload nginx (after SSL) ────────────────────────────────────────────
systemctl reload nginx

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅  TELAD FLEET – Deployed!            ║"
echo "╠══════════════════════════════════════════╣"
echo "║  🌐 Dashboard : https://fna.sa           ║"
echo "║  🔌 API       : https://api.fna.sa       ║"
echo "║  📊 PM2 logs  : pm2 logs telad-fleet     ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Admin login  : F  /  0241               ║"
echo "║  ⚠️  Change password after first login!   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
