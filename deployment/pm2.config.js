// ═══════════════════════════════════════════════════════════════════════
// TELAD FLEET – PM2 Process Manager Configuration
// Start:   pm2 start deployment/pm2.config.js
// Save:    pm2 save
// Startup: pm2 startup  (then run the printed command)
// Logs:    pm2 logs telad-fleet
// Monitor: pm2 monit
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  apps: [
    {
      name:        'telad-fleet',
      script:      './backend/server.js',
      cwd:         '/var/www/telad-fleet',
      instances:   1,            // increase to 'max' when adding DB
      exec_mode:   'fork',       // use 'cluster' with real DB
      watch:       false,
      max_memory_restart: '512M',

      env_production: {
        NODE_ENV:    'production',
        PORT:        5000,
      },

      // Logging
      out_file:  './logs/out.log',
      error_file:'./logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Auto-restart
      autorestart:   true,
      restart_delay: 3000,
      min_uptime:    '10s',
      max_restarts:  10,
    },
  ],
};
