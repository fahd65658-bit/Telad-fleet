// ═══════════════════════════════════════════════════════════════════════
// TELAD FLEET – PM2 Process Manager Configuration
// Start:   pm2 start deployment/pm2.config.js --env production
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
      // Use cluster mode for multi-core throughput once a real DB is in use.
      // Keep fork mode for now (in-memory store is not shared across workers).
      instances:   1,
      exec_mode:   'fork',
      watch:       false,
      max_memory_restart: '512M',

      env_production: {
        NODE_ENV:    'production',
        PORT:        5000,
      },

      // Logging
      out_file:       './logs/out.log',
      error_file:     './logs/error.log',
      log_date_format:'YYYY-MM-DD HH:mm:ss',
      merge_logs:     true,

      // Auto-restart with exponential back-off protection
      autorestart:    true,
      restart_delay:  3000,
      min_uptime:     '10s',
      max_restarts:   10,

      // Graceful shutdown — give in-flight requests time to complete
      kill_timeout:   5000,
      wait_ready:     true,
      listen_timeout: 10000,
    },
  ],
};
