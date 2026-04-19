'use strict';

const MAX_ACTIVITY_ENTRIES = 100;
const activityLog = [];

function trimActivityLog() {
  if (activityLog.length > MAX_ACTIVITY_ENTRIES) {
    activityLog.splice(0, activityLog.length - MAX_ACTIVITY_ENTRIES);
  }
}

function logActivity(type, message, data = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  activityLog.push(entry);
  trimActivityLog();
  return entry;
}

function getActivityLog() {
  return [...activityLog].reverse();
}

function notifyAllManagers(message, data = {}) {
  return logActivity('manager_notification', message, data);
}

function createMaintenanceFromIssue(issue = {}) {
  const maintenanceRequest = {
    issueNumber: issue.number,
    title: issue.title,
    description: issue.body || '',
    author: issue.user?.login || 'unknown',
    status: 'pending',
    source: 'github_issue',
    createdAt: new Date().toISOString(),
    url: issue.html_url || null,
  };

  logActivity('maintenance_request', 'تم إنشاء طلب صيانة من GitHub Issue', maintenanceRequest);
  return maintenanceRequest;
}

function createEmergencyAlert(alertData = {}) {
  const alert = {
    severity: 'high',
    source: 'github_deployment',
    message: alertData.message || 'تنبيه طارئ: فشل في النشر',
    details: alertData,
    createdAt: new Date().toISOString(),
  };

  logActivity('emergency_alert', alert.message, alert);
  return alert;
}

module.exports = {
  createMaintenanceFromIssue,
  notifyAllManagers,
  logActivity,
  getActivityLog,
  createEmergencyAlert,
};
