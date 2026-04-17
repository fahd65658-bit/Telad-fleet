const http = require('http');
const handler = require('./api/index.js');

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  http.createServer((req, res) => handler(req, res)).listen(port, '0.0.0.0', () => {
    console.log(`Telad Fleet is running on http://localhost:${port}`);
  });
}

module.exports = handler;
