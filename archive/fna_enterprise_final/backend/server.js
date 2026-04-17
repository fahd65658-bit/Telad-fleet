
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.json());

// 🚗 GPS STREAM
io.on('connection', (socket) => {
  socket.on('gps', (data) => {
    io.emit('gps-stream', data);
  });
});

// 🚗 GPS API
app.post('/gps', (req, res) => {
  io.emit('gps-stream', req.body);
  res.json({ ok: true });
});

// 🧠 AI SIMPLE
app.get('/ai/predict', (req, res) => {
  res.json({
    risk: Math.random() * 100,
    status: 'OK'
  });
});

http.listen(5000, () => {
  console.log('🚀 FNA Backend Running');
});
