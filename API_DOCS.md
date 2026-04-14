# 📖 TELAD FLEET – API Documentation

> **Base URL (Production):** `https://api.fna.sa`  
> **Base URL (Development):** `http://localhost:5000`  
> **Version:** 2.0.0

---

## 🔐 Authentication

All endpoints (except `/health` and `/auth/login`) require a JWT Bearer token.

```
Authorization: Bearer <token>
```

Tokens expire after **8 hours**.

---

## Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | System health check |

```json
// GET /health
{
  "status": "ok",
  "system": "TELAD FLEET",
  "domain": "fna.sa",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "2.0.0"
}
```

---

### Auth

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| POST | `/auth/login` | None | — | Login, get JWT token |
| GET | `/auth/me` | ✅ | All | Get current user info |

#### POST /auth/login

```json
// Request
{ "username": "F", "password": "0241" }

// Response 200
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "name": "مدير النظام", "username": "F", "email": "admin@fna.sa", "role": "admin" }
}

// Response 401
{ "error": "اسم المستخدم أو كلمة المرور غير صحيحة" }
```

---

### Users

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | `/auth/users` | ✅ | admin | List all users |
| POST | `/auth/users` | ✅ | admin | Create new user |
| PUT | `/auth/users/:id` | ✅ | admin | Update user |
| DELETE | `/auth/users/:id` | ✅ | admin | Delete user |

#### POST /auth/users

```json
// Request
{
  "name": "محمد أحمد",
  "username": "m.ahmad",
  "email": "m.ahmad@fna.sa",
  "password": "SecurePass123",
  "role": "supervisor"
}

// Response 201 — user object (without passwordHash)
```

**Roles:** `admin` | `supervisor` | `operator` | `viewer`

---

### Vehicles

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | `/vehicles` | ✅ | All | List vehicles |
| POST | `/vehicles` | ✅ | admin, supervisor, operator | Add vehicle |
| DELETE | `/vehicles/:id` | ✅ | admin, supervisor | Delete vehicle |

#### GET /vehicles — Query Params

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 50, max: 100) |
| `search` | string | Search by name, plate, city, driver |
| `status` | string | Filter by status: active \| maintenance \| inactive |

```json
// GET /vehicles?page=1&limit=10&search=رياض
[
  {
    "id": "uuid",
    "name": "تويوتا هايلوكس",
    "plate": "ABC 1234",
    "city": "الرياض",
    "driver": "أحمد محمد",
    "status": "active"
  }
]
```

#### POST /vehicles

```json
// Request
{
  "name": "تويوتا هايلوكس",
  "plate": "ABC 1234",
  "city": "الرياض",
  "driver": "أحمد محمد",
  "status": "active"
}
```

---

### Cities & Projects

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | `/cities` | ✅ | All | List cities |
| POST | `/cities` | ✅ | admin, supervisor | Add city |
| GET | `/projects` | ✅ | All | List projects |
| POST | `/projects` | ✅ | admin, supervisor | Add project |

---

### Employees

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | `/employees` | ✅ | All | List employees |
| POST | `/employees` | ✅ | admin, supervisor | Add employee |

---

### Maintenance

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | `/maintenance` | ✅ | All | List maintenance records |
| POST | `/maintenance` | ✅ | admin, supervisor, operator | Add record |
| GET | `/accidents` | ✅ | All | List accidents |
| POST | `/accidents` | ✅ | admin, supervisor, operator | Report accident |
| GET | `/violations` | ✅ | All | List violations |
| POST | `/violations` | ✅ | admin, supervisor, operator | Add violation |

#### POST /maintenance

```json
// Request
{
  "vehicleId": "uuid",
  "type": "صيانة دورية",
  "description": "تغيير زيت المحرك",
  "date": "2025-01-15",
  "cost": 250,
  "status": "completed"
}
```

---

### Dashboard & Reports

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | `/dashboard` | ✅ | All | Summary statistics |
| GET | `/reports/summary` | ✅ | admin, supervisor | Detailed report |
| GET | `/logs` | ✅ | admin | Audit logs |

```json
// GET /dashboard
{
  "cities": 5,
  "projects": 12,
  "vehicles": 48,
  "employees": 25
}
```

---

### GPS Tracking

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| POST | `/gps` | ✅ | admin, supervisor, operator | Update vehicle position |

#### WebSocket Events

Connect to the server via Socket.io:
```js
import { io } from 'socket.io-client';
const socket = io('https://api.fna.sa');

// Emit GPS update
socket.emit('gps', { vehicleId: 'uuid', lat: 24.68, lng: 46.72, speed: 80 });

// Listen for GPS stream
socket.on('gps-stream', (data) => console.log(data));
```

---

### AI Risk Scoring

| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | `/ai/predict` | ✅ | admin, supervisor | Get risk prediction |

```json
// GET /ai/predict
{
  "risk": 34.5,
  "confidence": 87.2,
  "status": "OK",
  "model": "telad-fleet-ai-v1"
}
```

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 10 requests | 15 minutes |
| All other endpoints | 120 requests | 1 minute |

---

## Error Responses

All errors follow this format:

```json
{ "error": "وصف الخطأ باللغة العربية" }
```

| Code | Meaning |
|------|---------|
| 400 | Bad Request — missing or invalid data |
| 401 | Unauthorized — missing or expired token |
| 403 | Forbidden — insufficient role |
| 404 | Not Found |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |
