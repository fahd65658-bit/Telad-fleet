'use strict';

/**
 * Returns a middleware that validates required fields in req.body.
 * @param {string[]} fields - required field names
 */
function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => req.body[f] === undefined || req.body[f] === '');
    if (missing.length) {
      return res.status(400).json({ error: `الحقول المطلوبة: ${missing.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireFields };
