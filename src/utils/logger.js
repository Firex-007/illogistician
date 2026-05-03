const config = require('../config');

const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  debug: (message, ...args) => {
    if (config.nodeEnv === 'development') {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  reject: (reason, details = {}) => {
    console.log(`[REJECTED] ${reason}`, JSON.stringify(details));
  }
};

module.exports = logger;
