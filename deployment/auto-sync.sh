#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – Auto-Sync Script
#
# Pulls latest code from GitHub and reloads PM2 only when there are
# actual changes (zero-downtime reload via PM2).
#
# Installed by deploy.sh as a cron job every 5 minutes:
#   */5 * * * * root /bin/bash /var/www/telad-fleet/deployment/auto-sync.sh
#
# Logs written to: /var/log/telad-fleet-sync.log
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/var/www/telad-fleet}"
LOG_FILE="/var/log/telad-fleet-sync.log"
APP_NAME="telad-fleet"
BRANCH="${GIT_BRANCH:-main}"

# ── Helpers ────────────────────────────────────────────────────────────
ts()  { date '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(ts) [sync] $*" >> "$LOG_FILE"; }
err() { echo "$(ts) [sync][ERROR] $*" >> "$LOG_FILE"; exit 1; }

log "── Auto-sync started ──────────────────────────────────────────"

# ── Sanity checks ──────────────────────────────────────────────────────
[[ -d "$DEPLOY_DIR/.git" ]] || err "Not a git repository: $DEPLOY_DIR"
command -v pm2  &>/dev/null || err "pm2 not found"
command -v npm  &>/dev/null || err "npm not found"

cd "$DEPLOY_DIR"

# ── Stash any accidental local modifications (config files etc.) ───────
git stash --quiet 2>>"$LOG_FILE" || true

# ── Fetch remote changes ────────────────────────────────────────────────
git fetch origin "$BRANCH" 2>>"$LOG_FILE" || err "git fetch failed"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "Already up to date ($LOCAL) — nothing to do."
  exit 0
fi

log "New commits detected: $LOCAL → $REMOTE"

# ── Pull ────────────────────────────────────────────────────────────────
git pull --ff-only origin "$BRANCH" 2>>"$LOG_FILE" \
  || err "git pull --ff-only failed (local diverged?)"

log "Code updated to $(git rev-parse HEAD)"

# ── Install/update Node dependencies if package.json changed ──────────
if git diff --name-only "$LOCAL" HEAD | grep -q '^package.*\.json$'; then
  log "package.json changed — running npm ci --omit=dev"
  npm ci --omit=dev >>"$LOG_FILE" 2>&1 \
    || err "npm ci failed"
  log "npm ci complete"
fi

# ── Zero-downtime reload via PM2 ───────────────────────────────────────
if pm2 list | grep -q "$APP_NAME"; then
  log "Reloading PM2 process: $APP_NAME"
  pm2 reload "$APP_NAME" --update-env >>"$LOG_FILE" 2>&1 \
    || err "pm2 reload failed"
  log "PM2 reload complete"
else
  log "PM2 process '$APP_NAME' not running — starting it now"
  pm2 start "$DEPLOY_DIR/deployment/pm2.config.js" --env production >>"$LOG_FILE" 2>&1 \
    || err "pm2 start failed"
  pm2 save >>"$LOG_FILE" 2>&1 || true
fi

log "── Auto-sync finished successfully ────────────────────────────"
