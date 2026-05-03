const CustodyService = require('../services/custody.service');
const logger = require('../utils/logger');

// POST /api/custody/handoff — Generate a custody transfer (outgoing custodian)
const initiateHandoff = (req, res) => {
  try {
    const { deviceId, fromCustodian, fromRole, notes } = req.body;

    if (!deviceId || !fromCustodian) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: deviceId, fromCustodian' });
    }

    const result = CustodyService.generateHandoff({ deviceId, fromCustodian, fromRole, notes });

    return res.status(201).json({
      ok: true,
      message: 'Custody transfer initiated. Share QR code with incoming custodian.',
      data: result,
    });
  } catch (error) {
    logger.error('Error initiating handoff', error);
    return res.status(error.message.includes('No shipment') ? 404 : 500).json({
      ok: false,
      error: error.message,
    });
  }
};

// POST /api/custody/accept — Accept a custody transfer (incoming custodian scans QR)
const acceptHandoff = (req, res) => {
  try {
    const { token, toCustodian, toRole } = req.body;

    if (!token || !toCustodian) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: token, toCustodian' });
    }

    const result = CustodyService.acceptHandoff({ token, toCustodian, toRole });

    return res.status(200).json({
      ok: true,
      message: 'Custody transfer accepted. You are now responsible for this shipment.',
      data: result,
    });
  } catch (error) {
    logger.error('Error accepting handoff', error);
    const status = error.message.includes('Invalid') ? 404
      : error.message.includes('already') ? 409
      : error.message.includes('expired') ? 410
      : 500;
    return res.status(status).json({ ok: false, error: error.message });
  }
};

// GET /api/custody/:deviceId/chain — Full custody audit trail
const getCustodyChain = (req, res) => {
  try {
    const chain = CustodyService.getCustodyChain(req.params.deviceId);
    return res.status(200).json({ ok: true, data: chain });
  } catch (error) {
    logger.error('Error fetching custody chain', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// GET /api/custody/:deviceId/attribution — Tamper responsibility analysis
const getTamperAttribution = (req, res) => {
  try {
    const analysis = CustodyService.getTamperAttribution(req.params.deviceId);
    return res.status(200).json({ ok: true, data: analysis });
  } catch (error) {
    logger.error('Error getting tamper attribution', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

module.exports = { initiateHandoff, acceptHandoff, getCustodyChain, getTamperAttribution };
