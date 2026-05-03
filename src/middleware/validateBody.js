const logger = require('../utils/logger');

const validateIngestBody = (req, res, next) => {
  const { payload, hmac_sha256, hash_chain } = req.body;

  if (!payload || !hmac_sha256 || !hash_chain) {
    logger.reject('Schema Validation Failed', { body: req.body });
    return res.status(400).json({ ok: false, error: 'Missing required fields: payload, hmac_sha256, hash_chain' });
  }

  next();
};

module.exports = { validateIngestBody };
