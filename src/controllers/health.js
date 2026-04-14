'use strict';

function healthCheck(_req, res) {
  res.json({
    status:    'ok',
    system:    'TELAD FLEET',
    domain:    'fna.sa',
    timestamp: new Date().toISOString(),
    version:   '2.0.0',
    uptime:    process.uptime(),
  });
}

module.exports = { healthCheck };
