const backend = require('./backend/server');

if (require.main === module && typeof backend.startServer === 'function') {
  backend.startServer(process.env.PORT || 5000);
}

module.exports = backend.app || backend;
