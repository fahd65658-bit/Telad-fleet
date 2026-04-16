<<<<<<< HEAD
# 🚗 TELAD FLEET — نظام إدارة الأسطول المتكامل

> **Domain:** https://fna.sa &nbsp;|&nbsp; **API:** https://api.fna.sa &nbsp;|&nbsp; **Version:** 2.0.0

---

## 📁 Project Structure

```
telad-fleet/
├── backend/                 ← Node.js + Express + Socket.io API
│   ├── server.js            ← Main server (auth, GPS, CRUD, WebSocket)
│   ├── package.json
│   └── .env.example         ← Copy to .env and fill values
│
├── frontend/                ← Dashboard Web App (SPA)
│   ├── index.html           ← Login + full dashboard
│   ├── css/style.css
│   └── js/app.js            ← Auth, navigation, CRUD logic
│
├── database/
│   └── schema.sql           ← PostgreSQL schema (production)
│
├── deployment/
│   ├── nginx.conf           ← nginx for fna.sa + api.fna.sa + SSL
│   ├── docker-compose.yml   ← Full stack (backend + DB + nginx)
│   ├── Dockerfile           ← Backend container
│   ├── pm2.config.js        ← PM2 process manager
│   └── deploy.sh            ← One-command VPS deploy
│
├── .gitignore
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

### 4. Open the dashboard
Open `frontend/index.html` in your browser, or:
```bash
npx serve frontend -l 3000
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

## 📄 GitHub Pages Deployment (Frontend Only)

- Workflow: `.github/workflows/static.yml`
- Trigger: push to `main` when files under `frontend/` change
- Publish source: `frontend/` directory only (not backend/deployment files)
- Required repo setting: **Settings → Pages → Build and deployment → Source = GitHub Actions**

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

| Method | Endpoint         | Auth   | Description           |
|--------|-----------------|--------|-----------------------|
| POST   | `/auth/login`   | ❌     | Login → JWT token     |
| GET    | `/auth/me`      | ✅     | Current user          |
| GET    | `/auth/users`   | admin  | List users            |
| POST   | `/auth/users`   | admin  | Add user              |
| PUT    | `/auth/users/:id` | admin | Update user/role    |
| DELETE | `/auth/users/:id` | admin | Delete user         |
| GET    | `/dashboard`    | all    | Stats summary         |
| GET    | `/vehicles`     | all    | List vehicles         |
| POST   | `/vehicles`     | operator+ | Add vehicle       |
| DELETE | `/vehicles/:id` | supervisor+ | Delete vehicle |
| GET    | `/logs`         | admin  | Audit log             |
| GET    | `/health`       | ❌     | Health check          |

---

## 📋 Roadmap
- [ ] PostgreSQL integration (schema ready at `database/schema.sql`)
- [ ] Live fleet map (Leaflet.js)
- [ ] Maintenance scheduling & alerts
- [ ] Reports with PDF export
- [ ] AI risk scoring
- [ ] Mobile driver app (Expo)
=======
>>>>>>> c34fdb6 (start)
