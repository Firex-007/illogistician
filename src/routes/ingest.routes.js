const express = require('express');
const { ingestPacket } = require('../controllers/ingest.controller');
const { validateIngestBody } = require('../middleware/validateBody');
const apiLimiter = require('../middleware/rateLimit');

const router = express.Router();

router.post('/', apiLimiter, validateIngestBody, ingestPacket);

module.exports = router;
