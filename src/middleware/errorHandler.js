const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Error', err.stack);
  res.status(500).json({
    ok: false,
    error: 'Internal Server Error'
  });
};

module.exports = errorHandler;
