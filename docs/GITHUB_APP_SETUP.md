# GitHub App Setup — TELAD Fleet Manager

## العربية

### 1) تسجيل GitHub App
1. افتح: https://github.com/settings/apps/new
2. استخدم بيانات `github-app/app-manifest.json`.
3. اضبط Webhook URL على: `https://api.fna.sa/api/github/webhook`.
4. فعّل الأحداث: push, pull_request, issues, deployment, deployment_status, check_run, check_suite, release, workflow_run, installation.

### 2) توليد وحفظ Private Key
1. من صفحة التطبيق: **Generate a private key**.
2. احفظ الملف داخل السيرفر: `github-app/private-key.pem`.
3. أو استخدم متغير البيئة `GITHUB_APP_PRIVATE_KEY` بصيغة متعددة الأسطر.

### 3) تثبيت التطبيق على المستودع
1. افتح صفحة التطبيق → **Install App**.
2. اختر المستودع `fahd65658-bit/Telad-fleet`.
3. انسخ Installation ID وضعه في `GITHUB_APP_INSTALLATION_ID`.

### 4) متغيرات البيئة على السيرفر
أضف القيم التالية إلى `.env`:
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY_PATH`
- `GITHUB_APP_WEBHOOK_SECRET`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_ENABLED=true`

### 5) التحقق والإعداد
```bash
npm run github-app:setup
npm run github-app:verify
```

### 6) اختبار محلي عبر smee.io
```bash
export SMEE_URL="https://smee.io/your-channel"
npm run github-app:dev
```

### 7) استكشاف الأخطاء
- تحقق من `POST /api/github/webhook` في nginx.
- تحقق من `GET /api/github/health`.
- راجع سجلات `github-app/logs/webhook-YYYY-MM-DD.log` و `error-YYYY-MM-DD.log`.
- تأكد من صحة `GITHUB_APP_WEBHOOK_SECRET` ومطابقته في GitHub.

---

## English

### 1) Register the GitHub App
1. Open: https://github.com/settings/apps/new
2. Use `github-app/app-manifest.json` as the source template.
3. Set webhook URL to: `https://api.fna.sa/api/github/webhook`.
4. Enable events: push, pull_request, issues, deployment, deployment_status, check_run, check_suite, release, workflow_run, installation.

### 2) Generate and store private key
1. In the app page, click **Generate a private key**.
2. Save it on the server as `github-app/private-key.pem`.
3. Or set `GITHUB_APP_PRIVATE_KEY` inline in environment variables.

### 3) Install app on repository
1. Go to **Install App**.
2. Select repository `fahd65658-bit/Telad-fleet`.
3. Copy installation ID to `GITHUB_APP_INSTALLATION_ID`.

### 4) Server environment variables
Set:
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY_PATH`
- `GITHUB_APP_WEBHOOK_SECRET`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_ENABLED=true`

### 5) Setup and verification
```bash
npm run github-app:setup
npm run github-app:verify
```

### 6) Local testing with smee.io
```bash
export SMEE_URL="https://smee.io/your-channel"
npm run github-app:dev
```

### 7) Troubleshooting
- Verify nginx route for `POST /api/github/webhook`.
- Check `GET /api/github/health`.
- Inspect logs under `github-app/logs/`.
- Ensure webhook secret matches GitHub App settings.
