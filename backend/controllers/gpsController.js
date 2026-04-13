'use strict';

function postGps(io) {
  return (req, res) => {
    io.emit('gps-stream', req.body);
    res.json({ ok: true });
  };
}

module.exports = { postGps };
