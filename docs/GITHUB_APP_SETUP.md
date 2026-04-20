# GitHub App Setup Guide | دليل إعداد GitHub App

## English

### 1) Register the app
1. Open: https://github.com/settings/apps/new
2. Set app name: `TELAD Fleet Manager`
3. Homepage URL: `https://fna.sa`
4. Webhook URL: `https://api.fna.sa/api/github/webhook`
5. Callback URL: `https://fna.sa/github/callback`
6. Use permissions/events from `github-app/app-manifest.json`

### 2) Configure environment variables
Set these in production and local `.env` files:

```env
GITHUB_APP_ENABLED=true
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_WEBHOOK_URL=https://api.fna.sa/api/github/webhook
GITHUB_APP_REDIRECT_URL=https://fna.sa/github/callback
```

### 3) Local testing with smee.io
1. Create channel on https://smee.io
2. Start forwarder:
   ```bash
   npx smee --url <SMEE_URL> --target http://localhost:5000/api/github/webhook
   ```
3. Set temporary webhook URL in GitHub App settings to your Smee URL.

### 4) Verify setup
```bash
npm run github-app:setup
curl http://localhost:5000/api/github/health
```

### 5) Troubleshooting
- **401 invalid signature**: verify `GITHUB_APP_WEBHOOK_SECRET`.
- **disabled status**: set `GITHUB_APP_ENABLED=true`.
- **cannot comment on PR**: verify installation ID and permissions.
- **package not found**: run `npm install` in root and backend.

---

## العربية

### ١) تسجيل التطبيق
1. افتح: https://github.com/settings/apps/new
2. اسم التطبيق: `TELAD Fleet Manager`
3. رابط الصفحة الرئيسية: `https://fna.sa`
4. رابط Webhook: `https://api.fna.sa/api/github/webhook`
5. رابط Callback: `https://fna.sa/github/callback`
6. استخدم الصلاحيات والأحداث الموجودة في `github-app/app-manifest.json`

### ٢) إعداد متغيرات البيئة
أضف المتغيرات التالية في ملفات `.env` على الخادم والتطوير:

```env
GITHUB_APP_ENABLED=true
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_WEBHOOK_URL=https://api.fna.sa/api/github/webhook
GITHUB_APP_REDIRECT_URL=https://fna.sa/github/callback
```

### ٣) الاختبار المحلي باستخدام smee.io
1. أنشئ قناة على https://smee.io
2. شغّل التحويل:
   ```bash
   npx smee --url <SMEE_URL> --target http://localhost:5000/api/github/webhook
   ```
3. ضع رابط Smee في إعدادات Webhook داخل GitHub App.

### ٤) التحقق من الإعداد
```bash
npm run github-app:setup
curl http://localhost:5000/api/github/health
```

### ٥) استكشاف الأخطاء
- **خطأ توقيع 401**: تأكد من `GITHUB_APP_WEBHOOK_SECRET`.
- **التكامل غير مفعّل**: اضبط `GITHUB_APP_ENABLED=true`.
- **فشل التعليق على PR**: تأكد من التثبيت والصلاحيات.
- **الحزمة غير موجودة**: نفّذ `npm install` في الجذر و`backend`.
