# Telad Fleet

> **Domain:** https://fna.sa &nbsp;|&nbsp; **API:** https://api.fna.sa &nbsp;|&nbsp; **Version:** 2.1.0

لوحة تحكم عربية لإدارة الأسطول مع واجهة أمامية ثابتة وواجهة API.

---

## 📁 Project Structure

```
telad-fleet/
├── backend/                 ← Node.js + Express + Socket.io API
│   ├── server.js            ← Main server (auth, GPS, CRUD, WebSocket, persistence)
│   ├── data/                ← JSON persistence (created at runtime, not in VCS)
│   ├── package.json
│   └── .env.example         ← Copy to .env and fill values
│
├── frontend/                ← Dashboard Web App (SPA)
│   ├── index.html           ← Login + full dashboard
│   ├── css/style.css
│   └── js/app.js            ← Auth, navigation, CRUD logic
│
├── database/
│   └── schema.sql           ← PostgreSQL schema (for future migration)
│
├── deployment/
│   ├── nginx.conf           ← nginx for fna.sa + api.fna.sa + SSL
│   ├── docker-compose.yml   ← Full stack (backend + DB + nginx)
│   ├── Dockerfile           ← Backend container
│   ├── pm2.config.js        ← PM2 process manager (with DATA_DIR)
│   └── deploy.sh            ← One-command VPS deploy
│
├── docs/                    ← Additional documentation
│   ├── AI_ANALYSIS_SETUP.md
│   └── PROJECT_IDEAS.md
│
├── archive/                 ← Historical project archives (not active)
├── .gitignore
├── SECURITY.md
└── README.md
```

---

## 💾 Data Persistence

All data is saved as JSON files in `backend/data/` (or `DATA_DIR` env var).
The server:
- **Loads** all collections from disk on startup — survives restarts with zero data loss
- **Saves** atomically (write to `.tmp` then rename) after every successful mutation
- **Flushes** everything on `SIGTERM` / `SIGINT` before exit (PM2 reload / Docker stop)

In production, set `DATA_DIR` to a persistent volume path (e.g. `/var/www/telad-fleet/data`).

---

## 👤 الحساب الرئيسي / Default Admin

| Field    | Value              |
|----------|--------------------|
| Username | `F`                |
| Role     | مدير النظام (admin)|
| Email    | admin@fna.sa       |

> ⚠️ **غيّر كلمة المرور بعد أول تسجيل دخول** — Change password after first login via User Management.

---

## 🔐 نظام الصلاحيات / Roles & Permissions

| Role          | لوحة التحكم | المركبات | الصيانة/الحوادث | التقارير | AI | إدارة المستخدمين | طلبات التطوير |
|---------------|:-----------:|:--------:|:---------------:|:--------:|:--:|:----------------:|:-------------:|
| `admin`       | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `supervisor`  | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `operator`    | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `viewer`      | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 🚀 Quick Start — Local Development

### Requirements
- **Node.js** 18+ — https://nodejs.org

### 1. Install backend dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT_SECRET to any long random string
```

### 3. Start the backend
```bash
cd backend && node server.js
```
Backend running at → **http://localhost:5000**

### 4. Open the dashboard
Open `frontend/index.html` in your browser, or:
```bash
npx serve frontend -l 3000
```

### 5. Login
- Username: `F`  (check `.env` or server startup — default credentials set at first run)

---

## 🌐 Production Deployment on fna.sa

### Step 1 — DNS (at your domain registrar)

| Hostname | Type | Value          |
|----------|------|----------------|
| `@`      | A    | `YOUR_VPS_IP`  |
| `www`    | A    | `YOUR_VPS_IP`  |
| `api`    | A    | `YOUR_VPS_IP`  |

### Step 2 — Clone on VPS
```bash
ssh root@YOUR_VPS_IP
git clone https://github.com/fahd65658-bit/Telad-fleet /var/www/telad-fleet
```

### Step 3 — Configure .env
```bash
cp /var/www/telad-fleet/backend/.env.example /var/www/telad-fleet/backend/.env
nano /var/www/telad-fleet/backend/.env
# Required: JWT_SECRET=<openssl rand -hex 64>
# Optional: DATA_DIR=/var/www/telad-fleet/data  (persistent data volume)
```

### Step 4 — Run deploy script (one command)
```bash
cd /var/www/telad-fleet
chmod +x deployment/deploy.sh
sudo bash deployment/deploy.sh
```

This automatically installs Node.js, PM2, nginx, Certbot, gets free SSL, and starts the system.

### Step 5 — Verify
```bash
pm2 status
curl https://api.fna.sa/health
# Browser: https://fna.sa
```

---

## 🐳 Docker (Alternative)
```bash
cp backend/.env.example backend/.env  # fill values
docker compose -f deployment/docker-compose.yml up -d
```

---

## 🔧 PM2 Commands
```bash
pm2 logs telad-fleet     # Live logs
pm2 restart telad-fleet  # Graceful restart (data flushed before exit)
pm2 reload telad-fleet   # Zero-downtime reload
pm2 monit               # Dashboard
```

---

## 🔌 API Reference

Header required: `Authorization: Bearer <token>`

| Method | Endpoint              | Auth        | Description                    |
|--------|-----------------------|-------------|--------------------------------|
| POST   | `/auth/login`         | ❌          | Login → JWT token              |
| GET    | `/auth/me`            | ✅          | Current user                   |
| GET    | `/auth/users`         | admin       | List users                     |
| POST   | `/auth/users`         | admin       | Add user                       |
| PUT    | `/auth/users/:id`     | admin       | Update user/role               |
| DELETE | `/auth/users/:id`     | admin       | Delete user                    |
| GET    | `/dashboard`          | all         | Stats summary                  |
| GET    | `/vehicles`           | all         | List vehicles                  |
| POST   | `/vehicles`           | operator+   | Add vehicle                    |
| DELETE | `/vehicles/:id`       | supervisor+ | Delete vehicle                 |
| GET    | `/ai/insights`        | supervisor+ | AI fleet analysis              |
| POST   | `/ai/query`           | supervisor+ | AI chat query                  |
| GET    | `/dev-requests`       | admin       | List dev requests              |
| POST   | `/dev-requests`       | admin       | Submit AI-classified request   |
| PUT    | `/dev-requests/:id/status` | admin  | Update request status         |
| DELETE | `/dev-requests/:id`   | admin       | Delete request                 |
| GET    | `/health`             | ❌          | Health check                   |

---

## 📋 Roadmap
- [x] JSON file persistence (data survives restarts)
- [x] Graceful shutdown (SIGTERM flushes data)
- [x] AI Dev-Request panel (admin) — linked to GitHub Issues
- [ ] PostgreSQL integration (schema ready at `database/schema.sql`)
- [ ] Reports with PDF export
- [ ] Mobile driver app (Expo)

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
- `ADMIN_PASSWORD` (مطلوب للإنتاج — سيفشل تشغيل API بدون هذا المتغير)

### اختيارية

- `PORT` (يتجاهله Vercel غالبًا ويُدار تلقائيًا)
- `ADMIN_USERNAME` (افتراضي: `F`)
- `ADMIN_EMAIL` (افتراضي: `admin@fna.sa`)
- `OPENAI_API_KEY` (اختياري فقط عند استخدام تكامل AI SDK)
- `OPENAI_MODEL` (اختياري — الافتراضي `gpt-4o-mini`)

عند ضبط `OPENAI_API_KEY` يستخدم `/ai/query` تكامل **AI SDK** داخل الـ Node API الحالي بدون الحاجة إلى Next.js أو Nuxt أو Svelte، ومع غياب المفتاح يستمر الرد المحلي الاحتياطي الحالي بدون كسر السلوك.

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
