// ═══════════════════════════════════════════════════════════════════════
// TELAD FLEET – PM2 ecosystem configuration
// Usage: pm2 start config/pm2.config.js
// ═══════════════════════════════════════════════════════════════════════

const path = require('path');

module.exports = {
  apps: [
    {
      name:             'telad-fleet-backend',
      script:           './backend/server.js',
      cwd:              path.resolve(__dirname, '..'),
      instances:        'max',
      exec_mode:        'cluster',
      env: {
        NODE_ENV: 'development',
        PORT:     5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT:     5000,
      },

      // Restart policy
      max_memory_restart: '500M',
      restart_delay:      3000,
      max_restarts:       10,
      min_uptime:         '5s',

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file:        './logs/out.log',
      error_file:      './logs/error.log',
      merge_logs:      true,

      // Monitoring
      watch:           false,
    },
  ],
};
