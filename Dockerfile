# ═══════════════════════════════════════════════════
# TELAD FLEET – Multi-stage Dockerfile
# Stages:  backend  |  react-build  |  react-serve
# ═══════════════════════════════════════════════════

# ── Stage 1: Node dependencies ─────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Backend (Node/Express) ─────────────────
FROM node:22-alpine AS backend
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN rm -rf react-dashboard
RUN addgroup -S telad && adduser -S telad -G telad && chown -R telad:telad /app
USER telad
EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -sf http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]

# ── Stage 3: React – install ──────────────────────────
FROM node:22-alpine AS react-deps
WORKDIR /react
COPY react-dashboard/package*.json ./
RUN npm ci

# ── Stage 4: React – build ────────────────────────────
FROM node:22-alpine AS react-build
WORKDIR /react
COPY --from=react-deps /react/node_modules ./node_modules
COPY react-dashboard/ .
RUN npm run build

# ── Stage 5: React – serve (nginx) ───────────────────
FROM nginx:1.25-alpine AS react-serve
COPY --from=react-build /react/dist /usr/share/nginx/html
RUN printf 'server{\n listen 80;\n root /usr/share/nginx/html;\n location / { try_files $uri $uri/ /index.html; }\n gzip on;\n gzip_types text/css application/javascript application/json;\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80

# ── Default target: Python server (legacy / Vercel) ──
FROM python:3.12-slim
WORKDIR /app
COPY . /app
ENV PYTHONUNBUFFERED=1 PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/healthz', timeout=3)"
CMD ["python3", "server.py"]
