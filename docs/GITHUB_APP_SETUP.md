# GitHub App Setup / إعداد GitHub App

## العربية

1. ادخل إلى: **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. استخدم الملف `github-app/app-manifest.json` كمرجع للإعداد.
3. عيّن:
   - Homepage URL: `https://fna.sa`
   - Webhook URL: `https://fna.sa/api/github/webhook`
   - Callback URL: `https://fna.sa/github/callback`
4. فعّل الصلاحيات المطلوبة:
   - `contents:read`
   - `issues:write`
   - `pull_requests:write`
   - `deployments:write`
   - `checks:write`
   - `metadata:read`
5. فعّل الأحداث:
   - `push`, `pull_request`, `issues`, `deployment`, `deployment_status`, `check_run`, `check_suite`, `release`, `workflow_run`
6. أنشئ **Private Key** وحمّله داخل:
   - `github-app/private-key.pem`
7. أضف متغيرات البيئة في `.env`:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_PRIVATE_KEY_PATH`
   - `GITHUB_APP_WEBHOOK_SECRET`
   - `GITHUB_APP_INSTALLATION_ID`
8. نفّذ التحقق:
   - `npm run github-app:verify`
9. ثبّت التطبيق على المستودع `fahd65658-bit/Telad-fleet`.

### اختبار Webhooks محلياً عبر smee.io

1. ثبّت الأدوات:
   - `npm i -D smee-client`
2. أنشئ قناة في `https://smee.io`.
3. شغّل:
   - `npx smee -u <SMEE_URL> -t http://localhost:5000/api/github/webhook`
4. استخدم `<SMEE_URL>` كـ Webhook URL مؤقت في GitHub App.

### استكشاف الأخطاء

- خطأ 401 في Webhook: تأكد من `GITHUB_APP_WEBHOOK_SECRET`.
- خطأ JWT: تحقق من `GITHUB_APP_ID` وصلاحية المفتاح الخاص.
- فشل جلب التثبيتات: تأكد أن التطبيق مثبت على المستودع الصحيح.

---

## English

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Use `github-app/app-manifest.json` as the baseline configuration.
3. Set:
   - Homepage URL: `https://fna.sa`
   - Webhook URL: `https://fna.sa/api/github/webhook`
   - Callback URL: `https://fna.sa/github/callback`
4. Grant permissions:
   - `contents:read`
   - `issues:write`
   - `pull_requests:write`
   - `deployments:write`
   - `checks:write`
   - `metadata:read`
5. Subscribe to events:
   - `push`, `pull_request`, `issues`, `deployment`, `deployment_status`, `check_run`, `check_suite`, `release`, `workflow_run`
6. Generate and download the **Private Key** to:
   - `github-app/private-key.pem`
7. Configure environment variables in `.env`:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_PRIVATE_KEY_PATH`
   - `GITHUB_APP_WEBHOOK_SECRET`
   - `GITHUB_APP_INSTALLATION_ID`
8. Run verification:
   - `npm run github-app:verify`
9. Install the app on `fahd65658-bit/Telad-fleet`.

### Local webhook testing with smee.io

1. Install development dependency:
   - `npm i -D smee-client`
2. Create a channel at `https://smee.io`.
3. Run:
   - `npx smee -u <SMEE_URL> -t http://localhost:5000/api/github/webhook`
4. Set `<SMEE_URL>` as temporary webhook URL in the GitHub App settings.

### Troubleshooting

- 401 webhook errors: check `GITHUB_APP_WEBHOOK_SECRET`.
- JWT generation failures: verify `GITHUB_APP_ID` and private key.
- Installation listing failure: ensure the app is installed on the target repository.
