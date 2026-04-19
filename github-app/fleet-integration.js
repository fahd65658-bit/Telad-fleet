'use strict';

const activityLog = [];
const MAX_ACTIVITY_LOG_SIZE = 500;
const VEHICLE_ID_PATTERN_EN = /vehicleId:\s*([\w-]+)/i;
const VEHICLE_ID_PATTERN_AR = /مركبة:\s*([\w-]+)/i;
let ioInstance = null;

/**
 * Attach socket.io server instance for real-time notifications.
 * @param {import('socket.io').Server | null} io
 */
function setSocketIO(io) {
  ioInstance = io || null;
}

/**
 * Append activity log entry (in-memory ring buffer).
 * @param {string} type
 * @param {object} data
 * @returns {{id: string, type: string, data: object, timestamp: string}}
 */
function logActivity(type, data = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  activityLog.unshift(entry);
  if (activityLog.length > MAX_ACTIVITY_LOG_SIZE) activityLog.length = MAX_ACTIVITY_LOG_SIZE;

  return entry;
}

/**
 * Return recent activity entries.
 * @param {number} limit
 * @returns {Array<object>}
 */
function getActivity(limit = 100) {
  return activityLog.slice(0, Math.max(1, Math.min(limit, MAX_ACTIVITY_LOG_SIZE)));
}

/**
 * Create maintenance request in Fleet backend from GitHub issue.
 * @param {object} issue
 * @returns {Promise<object>}
 */
async function createMaintenanceFromIssue(issue) {
  const apiBase = process.env.GITHUB_APP_INTERNAL_API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
  const payload = {
    vehicleId: issue?.body?.match(VEHICLE_ID_PATTERN_EN)?.[1] || issue?.body?.match(VEHICLE_ID_PATTERN_AR)?.[1] || 'unknown',
    type: 'بلاغ GitHub',
    description: issue?.title || 'طلب صيانة وارد من GitHub',
    scheduledDate: new Date().toISOString().slice(0, 10),
    cost: null,
  };

  try {
    const response = await fetch(`${apiBase}/api/maintenance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.GITHUB_APP_INTERNAL_API_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_APP_INTERNAL_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Maintenance API error (${response.status}): ${text}`);
    }

    const body = await response.json();
    logActivity('maintenance.created', { issueNumber: issue?.number, maintenance: body });
    return body;
  } catch (error) {
    logActivity('maintenance.failed', { issueNumber: issue?.number, error: error.message });
    return { ok: false, error: error.message, fallback: true };
  }
}

/**
 * Notify all managers through socket channels.
 * @param {string} event
 * @param {object} data
 */
function notifyAllManagers(event, data = {}) {
  if (!ioInstance) {
    logActivity('notify.skipped', { event, reason: 'io_unavailable' });
    return;
  }

  ioInstance.to('role:admin').emit('github:event', { event, data, timestamp: new Date().toISOString() });
  ioInstance.emit('github:manager-notification', { event, data, timestamp: new Date().toISOString() });
  logActivity('notify.sent', { event, data });
}

/**
 * Update system version based on release tag.
 * @param {string} releaseTag
 * @returns {{ok: boolean, version: string}}
 */
function updateSystemVersion(releaseTag) {
  logActivity('system.version.updated', { version: releaseTag });
  return { ok: true, version: releaseTag };
}

/**
 * Trigger emergency alert flow.
 * @param {string} message
 */
function createEmergencyAlert(message) {
  notifyAllManagers('emergency_alert', { message });
  logActivity('emergency.alert', { message });
}

/**
 * Sync deployment status with Fleet records.
 * @param {string} status
 */
function syncDeploymentStatus(status) {
  logActivity('deployment.status', { status });
  notifyAllManagers('deployment_status', { status });
}

module.exports = {
  setSocketIO,
  createMaintenanceFromIssue,
  notifyAllManagers,
  updateSystemVersion,
  logActivity,
  getActivity,
  createEmergencyAlert,
  syncDeploymentStatus,
};
