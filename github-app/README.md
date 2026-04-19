# GitHub App — TELAD FLEET

## Architecture

```text
GitHub Events
   │
   ▼
/api/github/webhook (express.raw)
   │
   ▼
github-app/index.js
   ├─ auth.js (JWT + installation token cache)
   ├─ webhooks.js (event handlers)
   ├─ fleet-integration.js (maintenance/logs/socket bridge)
   └─ middleware/* (auth, rate limit, logger)
```

## Supported events
- push
- pull_request
- issues
- deployment
- deployment_status
- check_run
- release
- workflow_run
- installation

## Environment variables
See root `.env.example` and `backend/.env.example` for full list.

## API endpoints
- POST `/api/github/webhook`
- GET `/api/github/status`
- GET `/api/github/health`
- GET `/api/github/installations` (admin)
- GET `/api/github/activity` (admin)
- POST `/api/github/app/setup` (admin)
- POST `/api/github/test-webhook` (admin + dev only)

## Local test
1. Set env vars.
2. Run `npm run github-app:verify`.
3. Send webhook payload to local endpoint.

## Add new webhook handler
- Edit `github-app/webhooks.js`.
- Add `case '<event>'` in `handleWebhookEvent`.
- Add any fleet side-effects in `fleet-integration.js`.
