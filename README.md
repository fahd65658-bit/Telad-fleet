# 🚗 TELAD FLEET — نظام إدارة الأسطول المتكامل

> **Domain:** https://fna.sa &nbsp;|&nbsp; **API:** https://api.fna.sa &nbsp;|&nbsp; **Version:** 2.0.0

📖 [API Documentation](./API_DOCS.md) &nbsp;|&nbsp; 🚀 [Setup Guide](./SETUP_GUIDE.md)

---

## 📁 Project Structure

```
telad-fleet/
├── backend/
│   ├── controllers/          ← Business logic (vehicles, users, maintenance…)
│   ├── middleware/           ← Auth, error handler, rate limiting, validation
│   ├── routes/               ← API route definitions
│   ├── services/             ← PostgreSQL, Redis, Email, AI
│   ├── utils/                ← Logger, validators, constants
│   ├── server.js             ← App entry point
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── index.html            ← Vanilla JS version (zero dependencies)
│   ├── js/app.js
│   ├── css/style.css
│   └── src/                  ← React 18 version (Vite + Tailwind)
│       ├── components/       ← Navigation, Sidebar, Map (Leaflet), Charts
│       ├── pages/            ← Login, Dashboard, Vehicles, Users, Maintenance…
│       ├── services/         ← API client, auth helpers, WebSocket
│       ├── context/          ← AppContext (auth + dark mode + notifications)
│       └── styles/
│
├── database/
│   └── schema.sql            ← PostgreSQL schema (production)
│
├── deployment/
│   ├── nginx.conf
│   ├── docker-compose.yml    ← Full stack: API + PostgreSQL + nginx
│   ├── Dockerfile
│   ├── pm2.config.js
│   └── deploy.sh
│
├── API_DOCS.md               ← Full API reference
├── SETUP_GUIDE.md            ← Step-by-step setup
└── README.md
```

---

## 👤 الحساب الرئيسي / Default Admin

| Field    | Value              |
|----------|--------------------|
| Username | `F`                |
| Password | `0241`             |
| Role     | مدير النظام (admin)|
| Email    | admin@fna.sa       |

> ⚠️ **غيّر كلمة المرور بعد أول تسجيل دخول** — Change password after first login via User Management.

---

## 🔐 نظام الصلاحيات / Roles & Permissions

| Role          | لوحة التحكم | المركبات | الصيانة/الحوادث | التقارير | AI | إدارة المستخدمين |
|---------------|:-----------:|:--------:|:---------------:|:--------:|:--:|:----------------:|
| `admin`       | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `supervisor`  | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `operator`    | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `viewer`      | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ |

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
cp .env.example .env
# Edit .env — set JWT_SECRET to any long random string
```

### 3. Start the backend
```bash
node server.js
```
Backend running at → **http://localhost:5000**

### 4a. Open Vanilla Frontend (quick start)
Open `frontend/index.html` in your browser, or:
```bash
npx serve frontend -l 3000
```

### 4b. Run React Frontend (full features)
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

### 5. Login
- Username: `F`  |  Password: `0241`

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
# Set JWT_SECRET=<openssl rand -hex 64>
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
pm2 restart telad-fleet  # Restart
pm2 monit               # Dashboard
```

---

## 🔌 API Reference

Header required: `Authorization: Bearer <token>`

| Method | Endpoint              | Auth        | Description                |
|--------|-----------------------|-------------|----------------------------|
| POST   | `/auth/login`         | ❌          | Login → JWT token          |
| GET    | `/auth/me`            | ✅          | Current user               |
| GET    | `/auth/users`         | admin       | List users                 |
| POST   | `/auth/users`         | admin       | Add user                   |
| PUT    | `/auth/users/:id`     | admin       | Update user/role           |
| DELETE | `/auth/users/:id`     | admin       | Delete user                |
| GET    | `/dashboard`          | all         | Stats summary              |
| GET    | `/vehicles`           | all         | List vehicles (w/ filters) |
| POST   | `/vehicles`           | operator+   | Add vehicle                |
| DELETE | `/vehicles/:id`       | supervisor+ | Delete vehicle             |
| GET    | `/maintenance`        | all         | Maintenance records        |
| POST   | `/maintenance`        | operator+   | Add maintenance record     |
| GET    | `/accidents`          | all         | Accidents list             |
| POST   | `/accidents`          | operator+   | Report accident            |
| GET    | `/ai/predict`         | supervisor+ | AI risk score              |
| GET    | `/logs`               | admin       | Audit log                  |
| GET    | `/health`             | ❌          | Health check               |

---

## ✨ Features

| Feature | Vanilla Frontend | React Frontend |
|---------|:---:|:---:|
| JWT Auth + Role-Based Access | ✅ | ✅ |
| Vehicles CRUD | ✅ | ✅ |
| User Management | ✅ | ✅ |
| GPS Real-time (WebSocket) | ✅ | ✅ |
| Live Fleet Map (Leaflet) | ✅ | ✅ |
| Maintenance Records | ✅ | ✅ |
| AI Risk Scoring | ✅ | ✅ |
| Dark Mode | — | ✅ |
| Charts & Analytics | — | ✅ |
| PDF Export | — | ✅ |
| Notifications | — | ✅ |
| Advanced Search/Filter | — | ✅ |
| PostgreSQL Support | ✅ | ✅ |
| Redis Caching | ✅ | ✅ |
| Email Notifications | ✅ | ✅ |
| Rate Limiting | ✅ | ✅ |
| Audit Logging | ✅ | ✅ |

## 📋 Roadmap
- [x] Backend restructured into controllers, routes, services, middleware
- [x] React frontend with Tailwind CSS, Leaflet maps, Chart.js
- [x] PostgreSQL integration (schema at `database/schema.sql`)
- [x] Redis caching layer (optional)
- [x] Email notifications (optional)
- [x] PDF export for reports
- [x] AI risk scoring
- [ ] Mobile driver app (Expo)
- [ ] Predictive maintenance AI
- [ ] Swagger / OpenAPI docs UI