'use strict';

function validateBody(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => !req.body || req.body[f] === undefined || req.body[f] === '');
    if (missing.length) {
      return res.status(400).json({ error: `الحقول المطلوبة: ${missing.join(', ')}` });
    }
    next();
  };
}

module.exports = { validateBody };
