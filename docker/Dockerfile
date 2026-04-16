# ═══════════════════════════════════════════════════════════════════════
# TELAD FLEET – Production Dockerfile
# ═══════════════════════════════════════════════════════════════════════

FROM node:20-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install dependencies only (cache layer)
FROM base AS deps
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production image
FROM base AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy deps
COPY --from=deps /app/node_modules ./node_modules

# Copy source (backend server + optional src modules)
COPY backend/server.js ./
COPY src/ ./src/

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
