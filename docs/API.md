# TELAD FLEET – API Reference

Base URL: `https://api.fna.sa`  
Development: `http://localhost:5000`

---

## Authentication

All protected endpoints require:
```
Authorization: Bearer <token>
```

### POST /auth/login

**Body:**
```json
{ "username": "F", "password": "0241" }
```

**Response:**
```json
{
  "token": "eyJ...",
  "user": { "id": 1, "name": "مدير النظام", "username": "F", "role": "admin" }
}
```

---

## Roles

| Role | Permissions |
|---|---|
| `admin` | Full access |
| `supervisor` | Read + Write (no user management) |
| `operator` | Read + Add records |
| `viewer` | Read only |

---

## Endpoints

### Health

**GET /health**
```json
{ "status": "ok", "system": "TELAD FLEET", "version": "2.0.0", "uptime": 123.4 }
```

### Vehicles

**GET /vehicles** – List all vehicles  
**POST /vehicles** – Add vehicle (operator+)  
**PUT /vehicles/:id** – Update vehicle (supervisor+)  
**DELETE /vehicles/:id** – Delete vehicle (supervisor+)

### Employees

**GET /employees** – List all  
**POST /employees** – Add (supervisor+)  
**PUT /employees/:id** – Update (supervisor+)  
**DELETE /employees/:id** – Delete (admin only)

### Drivers

**GET /drivers** – List all  
**POST /drivers** – Add (supervisor+)  
**PUT /drivers/:id** – Update (supervisor+)  
**DELETE /drivers/:id** – Delete (admin only)

### Maintenance

**GET /maintenance** – List all records  
**POST /maintenance** – Add record (operator+)  
**PUT /maintenance/:id** – Update (supervisor+)  
**DELETE /maintenance/:id** – Delete (admin only)

### Forms

**GET /forms** – List all forms  
**POST /forms** – Add form (operator+)  
**PUT /forms/:id** – Update (supervisor+)  
**DELETE /forms/:id** – Delete (admin only)

### Dashboard

**GET /dashboard** – Summary counts  
```json
{ "cities": 5, "projects": 4, "vehicles": 12, "employees": 20, "drivers": 8 }
```

### GPS / Real-time

**POST /gps** – Broadcast location (operator+)  
**WebSocket** `gps-stream` event – Real-time location updates

### AI

**GET /ai/predict** – Risk prediction (supervisor+)

### Audit

**GET /logs** – Audit log (admin only)

---

## Error Responses

| Code | Meaning |
|---|---|
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| POST /auth/login | 10 req / 15 min |
| All other routes | 120 req / min |
