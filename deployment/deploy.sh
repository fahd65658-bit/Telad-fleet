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
DATA_DIR="${DATA_DIR:-/var/www/telad-fleet/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/telad-fleet}"
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
apt-get install -y -qq curl git logrotate nginx ufw

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
mkdir -p "$DEPLOY_DIR/logs" "$DATA_DIR" "$BACKUP_DIR"

# ─── 6. App dependencies ─────────────────────────────────────────────────────
log "Installing application dependencies…"
cd "$DEPLOY_DIR"
npm ci --omit=dev

# ─── 7. .env from example (if not already set) ───────────────────────────────
if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
  warn ".env not found — copying from .env.example"
  cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  warn "⚠️  IMPORTANT: Edit $DEPLOY_DIR/.env and set JWT_SECRET + ADMIN_PASSWORD before going live!"
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

# ─── 13. Auto-sync cron (every 5 minutes) ────────────────────────────────────
log "Installing auto-sync cron (every 5 minutes)…"
chmod +x "$DEPLOY_DIR/deployment/auto-sync.sh"
cat >/etc/cron.d/telad-fleet-sync <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root DEPLOY_DIR=$DEPLOY_DIR /bin/bash $DEPLOY_DIR/deployment/auto-sync.sh
EOF
chmod 644 /etc/cron.d/telad-fleet-sync

cat >/etc/logrotate.d/telad-fleet-sync <<'EOF'
/var/log/telad-fleet-sync.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
EOF
log "Auto-sync cron installed — will pull from GitHub every 5 minutes"

# ─── 14. Daily backup cron ────────────────────────────────────────────────────
log "Installing daily backup cron…"
cat >/etc/cron.d/telad-fleet-backup <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * root DATA_DIR=$DATA_DIR BACKUP_DIR=$BACKUP_DIR /bin/bash $DEPLOY_DIR/deployment/backup.sh >> /var/log/telad-fleet-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/telad-fleet-backup

cat >/etc/logrotate.d/telad-fleet-backup <<'EOF'
/var/log/telad-fleet-backup.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
EOF

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅  TELAD FLEET – Deployed!            ║"
echo "╠══════════════════════════════════════════╣"
echo "║  🌐 Dashboard : https://fna.sa           ║"
echo "║  🔌 API       : https://api.fna.sa       ║"
echo "║  📊 PM2 logs  : pm2 logs telad-fleet     ║"
echo "║  💾 Data dir  : $DATA_DIR                 ║"
echo "║  🗂  Backups  : $BACKUP_DIR               ║"
echo "║  🔄 Auto-sync : every 5 min (git pull)   ║"
echo "║     Sync log  : /var/log/telad-fleet-sync.log ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Admin login  : admin / from .env        ║"
echo "║  ⚠️  Change password after first login!   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
