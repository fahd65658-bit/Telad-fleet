# Telad Fleet

لوحة تحكم عربية لإدارة الأسطول مع واجهة أمامية ثابتة وواجهة API.

## بنية المشروع

- **Frontend:** ملفات ثابتة (`index.html`, `styles.css`, `app.js`)
- **Backend (Live على Vercel):** دالة Node Serverless في `api/index.js`
- **Backend محلي بديل:** خادم Python في `server.py` للتشغيل المحلي/التجريبي
- **Backend إضافي (legacy):** `backend/server.js` (Express) للمسارات القديمة خارج Vercel

## المتطلبات المحلية

- Node.js 18+
- Python 3.10+

## أوامر المشروع (root)

```bash
npm install
npm run lint
npm run build
npm test
npm start
```

## التشغيل المحلي

### 1) نفس نمط Vercel (Node API + static)

```bash
npm install
npm start
```

ثم افتح:

```text
http://localhost:3000
```

### 2) تشغيل Python المحلي (اختياري)

```bash
python3 server.py
```

## Health Check

- `/healthz`
- `/api/health`

## متغيرات البيئة

انسخ `.env.example` إلى `.env` محليًا.

### مطلوبة للإنتاج على Vercel

- `NODE_ENV=production`
- `ADMIN_PASSWORD` (مطلوب للإنتاج لتفعيل تسجيل دخول المدير الافتراضي)

### اختيارية

- `PORT` (يتجاهله Vercel غالبًا ويُدار تلقائيًا)
- `ADMIN_USERNAME` (افتراضي: `F`)
- `ADMIN_EMAIL` (افتراضي: `admin@fna.sa`)
- `OPENAI_API_KEY` (اختياري فقط عند استخدام التكامل)

> ملاحظة أمنية: لا تحفظ أي أسرار حقيقية داخل المستودع. أضفها من لوحة Vercel فقط.

## النشر على Vercel (Git Integration - الموصى به)

1. من Vercel: **Add New → Project**
2. اختر مستودع: `fahd65658-bit/Telad-fleet`
3. Framework Preset: **Other**
4. اترك الإعدادات الافتراضية (لا حاجة لتوكن Vercel في GitHub)
5. أضف متغيرات البيئة في Vercel Project Settings → Environment Variables
6. نفّذ Deploy

## ما المتبقي على لوحة Vercel بعد دمج هذا PR

1. ربط المستودع عبر Git Integration
2. إضافة `ADMIN_PASSWORD` (وغيرها عند الحاجة)
3. (اختياري) تعيين Custom Domain
4. التحقق من:
   - `https://<your-domain>/healthz`
   - `https://<your-domain>/api/status`

## CI

تم تحويل workflow الموجود في GitHub Actions إلى **CI تحقق** (lint/build/test) على PRs و `main` بدون أي Vercel token.
