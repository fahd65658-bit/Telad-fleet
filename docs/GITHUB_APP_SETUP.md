# GitHub App Setup Guide / دليل إعداد GitHub App

## العربية — خطوات إعداد GitHub App لنظام TELAD FLEET
1. ادخل إلى: https://github.com/settings/apps/new
2. سجّل التطبيق أو استخدم `github-app/app-manifest.json`.
3. اضبط Webhook URL إلى: `https://api.fna.sa/api/github/webhook`
4. نزّل Private Key واحفظه على الخادم (مثال: `./github-app/private-key.pem`).
5. أضف متغيرات البيئة المطلوبة في الخادم (PM2 + nginx).
6. شغّل التحقق: `node github-app/setup.js --verify`
7. للاختبار المحلي مع توجيه webhook استخدم `smee.io`.

## English — GitHub App Setup Guide
1. Go to https://github.com/settings/apps/new
2. Register the app or bootstrap with `github-app/app-manifest.json`.
3. Set webhook URL to: `https://api.fna.sa/api/github/webhook`
4. Download the private key and store it securely on server (e.g. `./github-app/private-key.pem`).
5. Configure required environment variables on VPS.
6. Verify setup with: `node github-app/setup.js --verify`
7. For local webhook testing, use `smee.io` forwarding.

## Environment Variables
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_PATH`
- `GITHUB_APP_WEBHOOK_SECRET`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_ENABLED=true`

## Troubleshooting
- **401 Invalid signature**: Ensure webhook secret matches GitHub App webhook secret.
- **Token generation fails**: Verify app ID and private key format/permissions.
- **No events in dashboard**: Ensure Socket.IO server is running and app is enabled.
- **Webhook 5xx**: Check PM2 logs and `github-app/middleware/logger.js` output.

## Security Notes
- Never commit private keys or secrets to repository.
- Rotate webhook secret and private key periodically.
- Keep admin endpoints protected with JWT admin role.
- Restrict server file permissions for private key files.
