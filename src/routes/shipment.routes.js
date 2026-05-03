const express = require('express');
const { getLatest, getHistory, getVerify, getStats } = require('../controllers/shipment.controller');

const router = express.Router();

router.get('/:deviceId/latest', getLatest);
router.get('/:deviceId/history', getHistory);
router.get('/:deviceId/verify', getVerify);
router.get('/:deviceId/stats', getStats);

module.exports = router;
