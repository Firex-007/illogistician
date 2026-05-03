const config = require('../config');
const logger = require('../utils/logger');
const HmacService = require('../services/hmac.service');
const ReplayService = require('../services/replay.service');
const HashChainService = require('../services/hashchain.service');
const IpfsService = require('../services/ipfs.service');
const BlockchainService = require('../services/blockchain.service');
const db = require('../db/store');

const ingestPacket = async (req, res) => {
  try {
    const { payload, hmac_sha256, hash_chain } = req.body;

    // 1. Device Authorization & Parse Payload
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (e) {
      logger.reject('Invalid JSON payload format', { payload });
      return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
    }

    const { device_id, timestamp, uptime_ms, prev_hash } = parsedPayload;

    if (device_id !== config.allowedDeviceId) {
      logger.reject('Device Authorization Failed', { expected: config.allowedDeviceId, got: device_id });
      return res.status(403).json({ ok: false, error: 'Unauthorized device' });
    }

    // 2. HMAC Verification
    if (!HmacService.verify(payload, hmac_sha256)) {
      logger.reject('HMAC Mismatch', { device_id });
      return res.status(401).json({ ok: false, error: 'Invalid HMAC signature' });
    }

    // 3 & 4 & 5. Transactional Replay, Chain Verification, and Persistence
    const processPacket = db.transaction(() => {
      // Replay Protection
      const replayCheck = ReplayService.check(device_id, timestamp, uptime_ms);
      if (replayCheck.isReplay) {
        throw new Error(JSON.stringify({ code: 409, message: 'Duplicate or replay packet detected', reason: replayCheck.reason }));
      }

      // Chain Verification
      const chainCheck = HashChainService.verify(device_id, prev_hash, payload, hmac_sha256, hash_chain);
      if (!chainCheck.isValid) {
        throw new Error(JSON.stringify({ code: 422, message: 'Hash chain continuity verification failed', reason: chainCheck.reason }));
      }

      // Persistence (Outbox Pattern: anchoring_status = 'PENDING')
      const stmt = db.prepare(`
        INSERT INTO shipments (device_id, timestamp, uptime_ms, payload, hmac_sha256, hash_chain, anchoring_status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `);
      
      stmt.run(device_id, timestamp, uptime_ms, payload, hmac_sha256, hash_chain);
    });

    try {
      processPacket();
      logger.info(`Successfully ingested packet from ${device_id}. Hash: ${hash_chain}. Queued for anchoring.`);
    } catch (err) {
      try {
        const parsedError = JSON.parse(err.message);
        logger.reject(parsedError.message, { reason: parsedError.reason, device_id });
        return res.status(parsedError.code).json({ ok: false, error: parsedError.message });
      } catch (e) {
        throw err; // Re-throw if it wasn't one of our custom JSON errors
      }
    }

    // Return success immediately (202 Accepted or 200 OK)
    return res.status(200).json({
      ok: true,
      message: 'Packet verified and queued for anchoring successfully',
      hash_chain: hash_chain
    });

  } catch (error) {
    logger.error('Error in ingest packet', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

module.exports = {
  ingestPacket
};
