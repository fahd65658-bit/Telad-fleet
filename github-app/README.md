# TELAD Fleet GitHub App

## Architecture
- `index.js`: core bootstrap, webhook router, signature gate.
- `auth.js`: GitHub App JWT + installation token cache + Octokit auth.
- `webhooks.js`: event handlers for fleet automation.
- `fleet-integration.js`: maintenance creation, deployment sync, manager notifications.
- `middleware/`: auth, rate limit, logging.
- `app-manifest.json`: registration template.
- `setup.js`: setup/verify script.

## Supported Events
- `push`
- `pull_request` (opened, merged)
- `issues` (maintenance / vehicle labels)
- `deployment`
- `deployment_status`
- `check_run`
- `check_suite`
- `release`
- `workflow_run`
- `installation`

## Testing
```bash
node --check github-app/index.js
node --check github-app/auth.js
node --check github-app/webhooks.js
node --check github-app/fleet-integration.js
npm run github-app:verify
```

## Security Best Practices
- Do not store secrets in source control.
- Use `GITHUB_APP_PRIVATE_KEY_PATH` or secured secret manager for private key.
- Keep webhook verification enabled with `x-hub-signature-256`.
- Use token cache with expiry refresh to reduce API rate pressure.
- Restrict admin endpoints with JWT and environment-based controls.
