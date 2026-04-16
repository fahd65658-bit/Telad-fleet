# TELAD FLEET – Security Guide

## Authentication & Authorization

- **JWT tokens** expire after 8 hours (configurable via `JWT_EXPIRES_IN`)
- **Role-based access control** (admin > supervisor > operator > viewer)
- **Password hashing** via bcrypt (cost factor 10)
- **Rate limiting** on login endpoint: 10 attempts / 15 minutes
- **General API** rate limit: 120 requests / minute

## Secrets Management

⚠️ **Never commit `.env` files to source control.**

Generate all secrets before deploying to production:

```bash
# JWT Secrets (64 bytes = 128 hex chars)
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# Encryption key (32 bytes = 64 hex chars)
ENCRYPTION_KEY=$(openssl rand -hex 32)
SIGNING_KEY=$(openssl rand -hex 32)

# Database password
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
```

Store secrets in:
- Environment variables (recommended)
- AWS Secrets Manager / Azure Key Vault
- HashiCorp Vault

## HTTP Security Headers

Helmet.js sets these headers automatically:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security`
- `Content-Security-Policy`

## CORS

Only these origins are allowed by default:
- `https://fna.sa`
- `https://www.fna.sa`
- `https://fleet.fna.sa`
- `http://localhost:3000` (dev only)

## Database Security

- Use a dedicated database user with minimal privileges
- Enable SSL connections to PostgreSQL in production
- Rotate credentials regularly

## Production Checklist

- [ ] Change default admin password (username=F, password=0241)
- [ ] Set `NODE_ENV=production`
- [ ] Set all required env vars (JWT_SECRET, JWT_REFRESH_SECRET, DB_PASS)
- [ ] Enable HTTPS (SSL certificate via Let's Encrypt)
- [ ] Configure firewall: only expose ports 80/443
- [ ] Set up automated database backups
- [ ] Enable audit logging
- [ ] Review and restrict CORS origins

## Reporting Vulnerabilities

Please report security vulnerabilities privately to: security@fna.sa
