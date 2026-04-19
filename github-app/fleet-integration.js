'use strict';

const http = require('http');

const activityLog = [];

function logActivity(type, data) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  activityLog.unshift(entry);
  if (activityLog.length > 100) activityLog.length = 100;
  return entry;
}

function getActivityLog() {
  return [...activityLog];
}

function createMaintenanceFromIssue(issue) {
  const payload = {
    githubIssueId: issue?.id,
    title: issue?.title,
    description: issue?.body || 'Maintenance issue created from GitHub App',
    source: 'github-app',
    createdAt: new Date().toISOString(),
  };

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/maintenance',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          logActivity('maintenance:create:response', {
            statusCode: res.statusCode,
            issueId: issue?.id,
            body: raw,
          });
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode });
        });
      }
    );

    req.on('error', (error) => {
      logActivity('maintenance:create:error', { issueId: issue?.id, message: error.message });
      resolve({ ok: false, error: error.message });
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

function notifyAllManagers(eventType, data) {
  return {
    eventType,
    audience: 'managers',
    data,
    timestamp: new Date().toISOString(),
  };
}

function createEmergencyAlert(message) {
  return {
    type: 'emergency',
    message,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  createMaintenanceFromIssue,
  notifyAllManagers,
  logActivity,
  getActivityLog,
  createEmergencyAlert,
};
