# GitHub App Setup Guide — TELAD FLEET

## 1) Register the App | تسجيل التطبيق
- Use `github-app/app-manifest.json`.
- Open: https://github.com/settings/apps/new
- Set callback: `https://fna.sa/github/callback`

## 2) Private Key | المفتاح الخاص
- Generate from GitHub App settings.
- Save to `github-app/private-key.pem` (server side only).
- Or use `GITHUB_APP_PRIVATE_KEY` inline env.

## 3) Webhook URL
- `https://api.fna.sa/api/github/webhook`
- Secret: `GITHUB_APP_WEBHOOK_SECRET`

## 4) Permissions | الصلاحيات
- contents: read
- issues: write
- pull_requests: write
- deployments: write
- checks: write
- metadata: read
- statuses: write
- actions: read

## 5) Install App on Repository
- Install on `fahd65658-bit/Telad-fleet`.
- Save installation ID into `GITHUB_APP_INSTALLATION_ID`.

## 6) VPS Environment Variables
Set all required vars from `.env.example` and `backend/.env.example`, then restart PM2.

## 7) Local Development with smee.io
- `npm i -D smee-client`
- Run: `npx smee -u <SMEE_URL> -t http://localhost:5000/api/github/webhook`

## 8) Test Webhooks
- Use GitHub “Recent Deliveries”.
- Or run `node github-app/setup.js --verify`.

## 9) Troubleshooting
- 401 signature error: verify raw body route + secret.
- 403/404 API errors: verify installation and permissions.
- Token errors: verify App ID and private key format.

## 10) Security Best Practices
- Never commit private key.
- Rotate webhook secret periodically.
- Use minimal permissions.
- Restrict admin routes with JWT.
