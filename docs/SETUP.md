# TELAD FLEET – Setup Guide

## Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- (Optional) PostgreSQL 15+ for production
- (Optional) Docker & Docker Compose

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/fahd65658-bit/Telad-fleet.git
cd Telad-fleet

# 2. Initialize (generates .env with secure secrets)
bash scripts/init.sh

# 3. Start the backend
cd backend && npm start

# 4. Verify
curl http://localhost:5000/health
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| PORT | No | Server port (default: 5000) |
| NODE_ENV | Yes | `development` or `production` |
| JWT_SECRET | **Production** | 64-char random hex |
| JWT_REFRESH_SECRET | **Production** | 64-char random hex |
| DB_PASS | **Production** | Strong database password |
| ENCRYPTION_KEY | No | 32-char hex key |
| OPENAI_API_KEY | No | OpenAI API key |

Generate secrets:
```bash
openssl rand -hex 64   # for JWT secrets
openssl rand -hex 32   # for encryption keys
```

---

## Default Admin

| Field | Value |
|---|---|
| Username | `F` |
| Password | `0241` |

⚠️ Change this password immediately in production!

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /health | None | Health check |
| POST | /auth/login | None | Login |
| GET | /auth/me | Any | Current user |
| GET | /vehicles | Any | List vehicles |
| POST | /vehicles | operator+ | Add vehicle |
| DELETE | /vehicles/:id | supervisor+ | Delete vehicle |
| GET | /employees | Any | List employees |
| GET | /drivers | Any | List drivers |
| GET | /maintenance | Any | Maintenance records |
| GET | /dashboard | Any | Summary stats |
| GET | /logs | admin | Audit logs |

---

## Docker Deployment

```bash
# Copy env vars
cp backend/.env.example backend/.env
# Edit backend/.env with real values

# Start all services
cd docker && docker-compose up -d

# Check logs
docker-compose logs -f backend
```

---

## Production Deployment

```bash
export JWT_SECRET="$(openssl rand -hex 64)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 64)"
export DB_PASS="$(openssl rand -base64 20)"

bash scripts/deploy.sh
```

See [docs/SECURITY.md](SECURITY.md) for security hardening steps.
