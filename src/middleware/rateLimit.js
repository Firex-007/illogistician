const rateLimit = require('express-rate-limit');

// Limit to 100 requests per windowMs (15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: {
    ok: false,
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = apiLimiter;
