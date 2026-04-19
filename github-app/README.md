# GitHub App Integration (TELAD FLEET)

## Overview
This module integrates GitHub App events with TELAD FLEET workflows for fna.sa.

## Files
- `app-manifest.json`: GitHub App registration manifest.
- `auth.js`: GitHub App JWT, installation token cache (50 min), webhook signature verification.
- `webhooks.js`: Event handlers for push, pull_request, issues, deployment, deployment_status, release, workflow_run, installation.
- `fleet-integration.js`: Fleet integration utilities and in-memory activity log (max 100 entries).
- `index.js`: Express router (`/webhook`, `/status`, `/health`) with graceful fallback.
- `setup.js`: Bilingual setup checker (Arabic + English).
- `middleware/*`: auth, rate-limit, and logging utilities.

## Environment Variables
- `GITHUB_APP_ENABLED=true`
- `GITHUB_APP_ID=`
- `GITHUB_APP_PRIVATE_KEY=`
- `GITHUB_APP_WEBHOOK_SECRET=`
- `GITHUB_APP_INSTALLATION_ID=`
- `GITHUB_APP_CLIENT_ID=`
- `GITHUB_APP_CLIENT_SECRET=`

## Notes
- No secrets are hardcoded.
- If `GITHUB_APP_ENABLED` is not `true`, routes return safe no-op responses.
- Webhook signature verification uses `x-hub-signature-256` and HMAC SHA-256.
