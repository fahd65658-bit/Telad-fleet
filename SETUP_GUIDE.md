# 🚀 TELAD FLEET – Setup Guide

نظام إدارة الأسطول المتكامل — دليل الإعداد المفصّل

---

## المتطلبات الأساسية

| أداة | الإصدار الأدنى | الغرض |
|------|----------------|-------|
| Node.js | 18+ | تشغيل الـ Backend |
| npm | 9+ | إدارة الحزم |
| PostgreSQL | 14+ | قاعدة البيانات (اختياري) |
| Redis | 7+ | التخزين المؤقت (اختياري) |

---

## 🖥️ الإعداد المحلي (Development)

### 1. تثبيت وتشغيل الـ Backend

```bash
cd backend
npm install
cp .env.example .env
```

عدّل `backend/.env`:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=any-long-random-string-here
```

ثم شغّل الخادم:
```bash
npm run dev   # أو: node server.js
```

✅ الـ API يعمل على: `http://localhost:5000`  
✅ Health check: `http://localhost:5000/health`

### 2. تشغيل الـ Frontend (Vanilla JS — الوضع السريع)

افتح مباشرة في المتصفح:
```
frontend/index.html
```

أو باستخدام Live Server (VS Code Extension):
- تأكد أن الـ backend يعمل على port 5000
- افتح `frontend/index.html` مع Live Server

### 3. تشغيل الـ Frontend (React)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

✅ التطبيق يعمل على: `http://localhost:5173`

---

## 🗄️ إعداد PostgreSQL (اختياري)

### تثبيت PostgreSQL (Ubuntu)
```bash
sudo apt install postgresql
sudo systemctl start postgresql
sudo -u postgres psql
```

### إنشاء قاعدة البيانات
```sql
CREATE DATABASE telad_fleet;
CREATE USER telad_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE telad_fleet TO telad_user;
\q
```

### تطبيق الـ Schema
```bash
psql -U telad_user -d telad_fleet -f database/schema.sql
```

### تحديث .env
```env
DATABASE_URL=postgresql://telad_user:your_password@localhost:5432/telad_fleet
```

---

## 📦 إعداد Redis (اختياري)

### تثبيت Redis
```bash
sudo apt install redis-server
sudo systemctl start redis
```

### تحديث .env
```env
REDIS_URL=redis://localhost:6379
```

---

## 📧 إعداد البريد الإلكتروني (اختياري)

أضف إلى `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@fna.sa
```

---

## 🐳 الإعداد باستخدام Docker

```bash
# 1. أنشئ ملف .env
cp backend/.env.example backend/.env
# عدّل القيم في backend/.env

# 2. شغّل الـ Stack الكامل
docker compose -f deployment/docker-compose.yml up -d

# 3. تحقق من الحالة
docker compose -f deployment/docker-compose.yml ps
```

---

## ☁️ النشر على VPS (Production)

### المتطلبات المسبقة
1. VPS بنظام Ubuntu 22.04+
2. Domain DNS يشير إلى IP الـ VPS:
   - `fna.sa` → VPS IP
   - `www.fna.sa` → VPS IP  
   - `api.fna.sa` → VPS IP

### خطوات النشر

```bash
# 1. الاتصال بالـ VPS
ssh root@YOUR_VPS_IP

# 2. استنساخ المشروع
git clone https://github.com/fahd65658-bit/Telad-fleet /var/www/telad-fleet
cd /var/www/telad-fleet

# 3. إعداد المتغيرات
cp backend/.env.example backend/.env
nano backend/.env
# أضف: JWT_SECRET=<output of: openssl rand -hex 64>
# أضف: NODE_ENV=production

# 4. تشغيل سكريبت النشر
chmod +x deployment/deploy.sh
sudo bash deployment/deploy.sh
```

---

## 🔑 تسجيل الدخول الأول

| الحقل | القيمة |
|-------|--------|
| اسم المستخدم | `F` |
| كلمة المرور | `0241` |
| الدور | مدير النظام |

> ⚠️ **غيّر كلمة المرور فور تسجيل الدخول!**  
> اذهب إلى: إدارة المستخدمين ← تعديل ← كلمة مرور جديدة

---

## 📊 مراقبة النظام

```bash
# PM2 - مراقبة الخدمة
pm2 status
pm2 logs telad-fleet
pm2 monit

# إعادة تشغيل بعد تحديث
git pull origin main
pm2 restart telad-fleet
```

---

## 🔧 استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| Port 5000 مشغول | `sudo lsof -i :5000` ثم `kill -9 <PID>` |
| خطأ JWT | أعد توليد `JWT_SECRET` جديد |
| لا يتصل بـ PostgreSQL | تحقق من `DATABASE_URL` في `.env` |
| خطأ CORS | أضف domain الـ Frontend إلى `CORS_ORIGINS` في `server.js` |
| SSL certificate خطأ | `sudo certbot renew --force-renewal` |

---

## 🏗️ هيكل المشروع

```
telad-fleet/
├── backend/
│   ├── controllers/          ← Business logic
│   │   ├── vehicleController.js
│   │   ├── userController.js
│   │   ├── maintenanceController.js
│   │   ├── reportsController.js
│   │   └── gpsController.js
│   ├── middleware/           ← Auth, error handling, rate limiting
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   ├── rateLimit.js
│   │   └── validation.js
│   ├── routes/               ← API route definitions
│   │   ├── vehicles.js
│   │   ├── users.js
│   │   ├── maintenance.js
│   │   ├── reports.js
│   │   └── gps.js
│   ├── services/             ← External services
│   │   ├── database.js       ← PostgreSQL
│   │   ├── cache.js          ← Redis
│   │   ├── email.js          ← Nodemailer
│   │   └── ai.js             ← AI risk scoring
│   ├── utils/
│   │   ├── constants.js
│   │   ├── logger.js
│   │   └── validators.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── index.html            ← Vanilla JS version (quick start)
│   ├── js/app.js
│   ├── css/style.css
│   ├── src/                  ← React version (full features)
│   │   ├── components/       ← Reusable UI components
│   │   ├── pages/            ← Route pages
│   │   ├── services/         ← API & WebSocket
│   │   ├── context/          ← State management
│   │   └── styles/
│   └── package.json
│
├── database/
│   └── schema.sql            ← PostgreSQL schema
│
├── deployment/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── pm2.config.js
│   └── deploy.sh
│
├── API_DOCS.md               ← API Documentation
├── SETUP_GUIDE.md            ← This file
└── README.md
```
