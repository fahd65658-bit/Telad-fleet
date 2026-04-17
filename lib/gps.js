'use strict';
/**
 * TELAD FLEET – Real GPS Live-Streaming Module
 * ─────────────────────────────────────────────────────────────────────────
 * Supports three modes (auto-selected at runtime):
 *
 *  A. Production  → External GPS devices/apps push data via:
 *       POST /api/gps/push  { vehicleId, lat, lng, speed?, heading? }
 *       (requires GPS_PUSH_TOKEN env var as Bearer)
 *
 *  B. Development → Server simulates movement for all active vehicles
 *       Enabled when GPS_SIMULATE=true (auto-enabled in dev)
 *
 *  C. Client Tracking → Browser sends position if vehicle is assigned
 *       POST /api/gps/client-push  (requires regular JWT, operator+)
 *
 * Broadcasts via Socket.IO:  socket.emit('gps:update', { vehicleId, lat, lng, speed, heading, accuracy })
 * Also emits:                socket.emit('gps:batch',  [{ vehicleId, lat, lng }])  every 5 s
 */

const SIMULATE     = process.env.GPS_SIMULATE !== 'false'; // default ON in dev
const GPS_TOKEN    = process.env.GPS_PUSH_TOKEN || null;   // device push token
const BATCH_MS     = parseInt(process.env.GPS_BATCH_MS  || '5000',  10);
const SIM_INTERVAL = parseInt(process.env.GPS_SIM_MS    || '3000',  10);
const MAX_SPEED_KMH = 120;

// ── Saudi Arabia bounding box for simulation ─────────────────────────────────
const SA_BOUNDS = { latMin: 16.0, latMax: 32.0, lngMin: 36.5, lngMax: 55.5 };

// In-process position store: vehicleId → { lat, lng, speed, heading, accuracy, updatedAt }
const _positions   = new Map();

let _io            = null;  // Socket.IO server instance
let _simTimer      = null;
let _batchTimer    = null;
let _dbRef         = null;  // db or pgDb

// ── Initialise ───────────────────────────────────────────────────────────────
function init(io, db) {
  _io    = io;
  _dbRef = db;

  // Pre-load positions from existing vehicle data
  const store = db.store || db;
  const vehicles = store.vehicles || [];
  for (const v of vehicles) {
    if (v.lat && v.lng) {
      _positions.set(v.id, {
        lat: v.lat, lng: v.lng,
        speed: 0, heading: Math.random() * 360,
        accuracy: 5, updatedAt: Date.now(),
      });
    }
  }

  // Batch broadcast (5 s cadence) – efficient for large fleets
  _batchTimer = setInterval(_broadcastBatch, BATCH_MS);

  // Simulation
  if (SIMULATE || process.env.NODE_ENV !== 'production') {
    console.log('[GPS] Simulation mode ON (GPS_SIMULATE=false to disable)');
    _simTimer = setInterval(_simulate, SIM_INTERVAL);
  }

  console.log(`[GPS] Live streaming ready · ${_positions.size} vehicles loaded`);
}

// ── Simulate incremental movement ───────────────────────────────────────────
function _simulate() {
  const store = _dbRef.store || _dbRef;
  const vehicles = (store.vehicles || []).filter(v => v.status === 'active' || v.status === 'charging');
  if (!vehicles.length) return;

  const updates = [];
  for (const v of vehicles) {
    if (!_positions.has(v.id)) {
      _positions.set(v.id, {
        lat: v.lat || 24.7 + (Math.random() - 0.5) * 10,
        lng: v.lng || 46.7 + (Math.random() - 0.5) * 10,
        speed: 0, heading: Math.random() * 360, accuracy: 10, updatedAt: Date.now(),
      });
    }
    const pos = _positions.get(v.id);

    // Realistic movement: small random walk with heading persistence
    const turnDelta = (Math.random() - 0.5) * 20;   // ±10° per step
    pos.heading     = (pos.heading + turnDelta + 360) % 360;

    // Simulate speed variation (0–120 km/h)
    const targetSpeed = v.status === 'active' ? 40 + Math.random() * 60 : 0;
    pos.speed = pos.speed + (targetSpeed - pos.speed) * 0.3;   // smooth

    // Distance per interval: speed(km/h) * time(h)
    const distKm  = (pos.speed / 3600) * (SIM_INTERVAL / 1000);
    const rad     = (pos.heading * Math.PI) / 180;
    const dlat    = (distKm / 111.32) * Math.cos(rad);
    const dlng    = (distKm / (111.32 * Math.cos((pos.lat * Math.PI) / 180))) * Math.sin(rad);

    pos.lat = Math.min(Math.max(pos.lat + dlat, SA_BOUNDS.latMin), SA_BOUNDS.latMax);
    pos.lng = Math.min(Math.max(pos.lng + dlng, SA_BOUNDS.lngMin), SA_BOUNDS.lngMax);
    pos.updatedAt = Date.now();
    pos.accuracy  = 5 + Math.random() * 10;

    updates.push({ vehicleId: v.id, ...pos });
  }

  // Emit individual updates for real-time markers
  if (_io) {
    for (const u of updates) {
      _io.emit('gps:update', { vehicleId: u.vehicleId, lat: u.lat, lng: u.lng, speed: u.speed, heading: u.heading });
    }
  }
}

// ── Batch broadcast ──────────────────────────────────────────────────────────
function _broadcastBatch() {
  if (!_io) return;
  const batch = [];
  for (const [vehicleId, pos] of _positions) {
    batch.push({ vehicleId, lat: pos.lat, lng: pos.lng, speed: pos.speed, heading: pos.heading });
  }
  if (batch.length) _io.emit('gps:batch', batch);
}

// ── Handle incoming push from GPS devices ────────────────────────────────────
function handleDevicePush(vehicleId, lat, lng, speed = 0, heading = 0, accuracy = 10) {
  if (!vehicleId || lat == null || lng == null) return false;
  _positions.set(vehicleId, { lat, lng, speed, heading, accuracy, updatedAt: Date.now() });

  // Persist to PG if available
  if (_dbRef && typeof _dbRef.upsertGps === 'function') {
    _dbRef.upsertGps(vehicleId, lat, lng, speed, heading, accuracy).catch(() => {});
  } else if (_dbRef) {
    // JSON store: update vehicle directly
    _dbRef.update('vehicles', vehicleId, { lat, lng });
  }

  if (_io) _io.emit('gps:update', { vehicleId, lat, lng, speed, heading, accuracy });
  return true;
}

// ── Get current position for a vehicle ───────────────────────────────────────
function getPosition(vehicleId) {
  return _positions.get(vehicleId) || null;
}

// ── Get all positions ─────────────────────────────────────────────────────────
function getAllPositions() {
  const out = [];
  for (const [vehicleId, pos] of _positions) out.push({ vehicleId, ...pos });
  return out;
}

// ── HTTP route handlers (mounted in server.js) ────────────────────────────────

/**
 * POST /api/gps/push
 * Authorization: Bearer <GPS_PUSH_TOKEN>   (device hardware token)
 * Body: { vehicleId, lat, lng, speed?, heading?, accuracy? }
 */
function routePush(req, res) {
  // Authenticate device token
  if (GPS_TOKEN) {
    const hdr = req.headers.authorization || '';
    const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (tok !== GPS_TOKEN) return res.status(401).json({ error: 'GPS token invalid' });
  }
  const { vehicleId, lat, lng, speed, heading, accuracy } = req.body || {};
  if (!vehicleId || lat == null || lng == null) return res.status(400).json({ error: 'vehicleId, lat, lng required' });
  handleDevicePush(vehicleId, parseFloat(lat), parseFloat(lng), parseFloat(speed)||0, parseFloat(heading)||0, parseFloat(accuracy)||10);
  res.json({ ok: true });
}

/**
 * POST /api/gps/client-push
 * Standard JWT auth (operator+), browser sends its GPS coords
 * Body: { lat, lng, accuracy? }
 */
function routeClientPush(req, res) {
  // The vehicleId comes from the token's assigned vehicle
  const { lat, lng, accuracy } = req.body || {};
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat, lng required' });

  // Look up vehicle assigned to this user/driver
  const store = _dbRef.store || _dbRef;
  const driver = (store.drivers || []).find(d => d.name === req.user?.name);
  const vehicleId = driver?.vehicleId ||
    (store.employees || []).find(e => e.name === req.user?.name)?.vehicleId;

  if (!vehicleId) return res.status(404).json({ error: 'No vehicle assigned to your account' });
  handleDevicePush(vehicleId, parseFloat(lat), parseFloat(lng), 0, 0, parseFloat(accuracy)||15);
  res.json({ ok: true, vehicleId });
}

/**
 * GET /api/gps/positions
 * Returns all current vehicle positions (JWT required)
 */
function routeGetPositions(_req, res) {
  res.json(getAllPositions());
}

/**
 * GET /api/gps/positions/:vehicleId
 */
function routeGetVehiclePosition(req, res) {
  const pos = getPosition(req.params.vehicleId);
  if (!pos) return res.status(404).json({ error: 'No GPS data for this vehicle' });
  res.json({ vehicleId: req.params.vehicleId, ...pos });
}

function destroy() {
  if (_simTimer)   clearInterval(_simTimer);
  if (_batchTimer) clearInterval(_batchTimer);
}

module.exports = { init, handleDevicePush, getPosition, getAllPositions, destroy, routePush, routeClientPush, routeGetPositions, routeGetVehiclePosition };
