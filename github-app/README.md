# GitHub App Integration (TELAD Fleet)

## Architecture
- `github-app/index.js`: Express router entrypoint and webhook dispatcher.
- `github-app/auth.js`: JWT creation, installation-token caching, webhook signature verification.
- `github-app/webhooks.js`: Event handlers for push/PR/issues/deploy/release/workflow/installation.
- `github-app/fleet-integration.js`: Bridge helpers between GitHub events and fleet backend.
- `backend/routes/github.js`: API routes exposed under `/api/github/*`.

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| `GITHUB_APP_ENABLED` | Yes | Enable GitHub App routes (`true` to enable). |
| `GITHUB_APP_ID` | Yes | GitHub App ID. |
| `GITHUB_APP_PRIVATE_KEY` | Yes* | PEM private key as string (`\\n` supported). |
| `GITHUB_APP_PRIVATE_KEY_PATH` | Yes* | PEM file path alternative to inline key. |
| `GITHUB_APP_WEBHOOK_SECRET` | Yes | Webhook HMAC secret. |
| `GITHUB_APP_INSTALLATION_ID` | Yes | GitHub installation ID. |

## Endpoints
- `POST /api/github/webhook`
- `GET /api/github/status`
- `GET /api/github/health`
- `GET /api/github/activity` (admin JWT)
- `POST /api/github/app/setup` (admin JWT)

## Event Handlers
- `push` → logs commits + emits `github:push`
- `pull_request` → Arabic comment on opened, `github:pr-merged` on merged
- `issues` → maintenance issue bridge + vehicle request log
- `deployment` / `deployment_status` → deployment notifications and emergency handling
- `release` → release notification
- `workflow_run` → CI status broadcast
- `installation` → installation audit logging
