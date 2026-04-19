'use strict';

const fs = require('fs');
const path = require('path');

const activityLogPath = path.join(__dirname, 'activity-log.json');
const integrationState = {
  io: null,
  logger: console,
};

function initFleetIntegration({ io, logger } = {}) {
  integrationState.io = io || null;
  integrationState.logger = logger || console;
}

function readActivities() {
  if (!fs.existsSync(activityLogPath)) return [];
  try {
    const raw = fs.readFileSync(activityLogPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeActivities(items) {
  fs.writeFileSync(activityLogPath, JSON.stringify(items, null, 2), 'utf8');
}

function getApiBase() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:5000';
}

async function createMaintenanceFromIssue(issue) {
  const enabled = process.env.GITHUB_APP_AUTO_MAINTENANCE !== 'false';
  if (!enabled) return { skipped: true, reason: 'auto-maintenance-disabled' };

  const body = {
    type: `GitHub Issue #${issue.number}`,
    description: issue.title,
    notes: issue.body || '',
    source: 'github-app',
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    status: 'pending',
  };

  try {
    const response = await fetch(`${getApiBase()}/api/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    integrationState.logger.error('⚠️ [GitHubApp] فشل إنشاء طلب الصيانة تلقائياً:', error.message);
    return {
      ok: false,
      error: error.message,
    };
  }
}

function notifyAllManagers(eventType, data = {}) {
  const message = `تنبيه إداري: حدث جديد من GitHub (${eventType})`;
  const payload = {
    eventType,
    message,
    data,
    createdAt: new Date().toISOString(),
  };

  if (integrationState.io) {
    integrationState.io.emit('github:managers', payload);
  }

  return payload;
}

function updateSystemVersion(tag) {
  return logActivity('system_version_updated', {
    tag,
    message: `تم تحديث إصدار النظام إلى ${tag}`,
  });
}

function logActivity(type, data = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    data,
    createdAt: new Date().toISOString(),
  };

  const activities = readActivities();
  activities.push(entry);
  if (activities.length > 3000) activities.splice(0, activities.length - 3000);
  writeActivities(activities);

  return entry;
}

function createEmergencyAlert(message) {
  const payload = {
    level: 'critical',
    message,
    createdAt: new Date().toISOString(),
  };

  if (integrationState.io && process.env.GITHUB_APP_EMERGENCY_ALERTS !== 'false') {
    integrationState.io.emit('github:emergency', payload);
  }

  logActivity('emergency_alert', payload);
  return payload;
}

function syncDeploymentStatus(status, deployUrl) {
  const payload = {
    status,
    deployUrl: deployUrl || null,
    notifyOnDeploy: process.env.GITHUB_APP_NOTIFY_ON_DEPLOY !== 'false',
    createdAt: new Date().toISOString(),
  };

  if (integrationState.io && payload.notifyOnDeploy) {
    integrationState.io.emit('github:deployment', payload);
  }

  logActivity('deployment_sync', payload);
  return payload;
}

function getActivityLog() {
  return readActivities().slice().reverse();
}

module.exports = {
  initFleetIntegration,
  createMaintenanceFromIssue,
  notifyAllManagers,
  updateSystemVersion,
  logActivity,
  createEmergencyAlert,
  syncDeploymentStatus,
  getActivityLog,
};
