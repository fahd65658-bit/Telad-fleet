'use strict';

function dashboard() {
  return (req, res) => {
    const { cities, projects, employees } = req.app.locals;
    const { vehicles } = require('./vehicleController');
    res.json({
      cities:    cities.length,
      projects:  projects.length,
      vehicles:  vehicles.length,
      employees: employees.length,
    });
  };
}

function auditLogs() {
  return (req, res) => {
    res.json(req.app.locals.auditLogs);
  };
}

module.exports = { dashboard, auditLogs };
