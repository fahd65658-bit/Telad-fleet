# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – Backend Dockerfile
# ═══════════════════════════════════════════════════════════════════════

FROM node:20-alpine

# Security: run as non-root
RUN addgroup -S telad && adduser -S telad -G telad

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source
COPY server.js db.js ./

# Reference environment template
COPY .env.example .

# Owned by the non-root user
RUN chown -R telad:telad /app
USER telad

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
