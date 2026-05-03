const express = require('express');
const { initiateHandoff, acceptHandoff, getCustodyChain, getTamperAttribution } = require('../controllers/custody.controller');

const router = express.Router();

// Custody handoff operations
router.post('/handoff', initiateHandoff);
router.post('/accept', acceptHandoff);
router.get('/:deviceId/chain', getCustodyChain);
router.get('/:deviceId/attribution', getTamperAttribution);

module.exports = router;
