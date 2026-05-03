const db = require('../db/store');
const IpfsService = require('../services/ipfs.service');
const BlockchainService = require('../services/blockchain.service');
const logger = require('../utils/logger');
const config = require('../config');

class OutboxWorker {
  constructor(pollIntervalMs = 15000) {
    this.pollIntervalMs = pollIntervalMs;
    this.isRunning = false;
    this.timer = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Starting Outbox Worker (polling every ${this.pollIntervalMs}ms)`);
    this.timer = setInterval(() => this.processPendingRecords(), this.pollIntervalMs);
    // Initial run
    setTimeout(() => this.processPendingRecords(), 1000);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Stopped Outbox Worker');
  }

  async processPendingRecords() {
    try {
      // Find one pending record (process sequentially to maintain order and prevent rate limits)
      const record = db.prepare(`SELECT * FROM shipments WHERE anchoring_status = 'PENDING' ORDER BY id ASC LIMIT 1`).get();
      
      if (!record) return; // Nothing to process

      logger.info(`Outbox processing record ID ${record.id} for device ${record.device_id}...`);

      const payloadObj = JSON.parse(record.payload);

      // 1. IPFS Pinning
      const cid = await IpfsService.pinJSONToIPFS({
        device_id: record.device_id,
        timestamp: record.timestamp,
        uptime_ms: record.uptime_ms,
        payload: payloadObj,
        hmac_sha256: record.hmac_sha256,
        hash_chain: record.hash_chain
      }, `packet_${record.device_id}_${record.timestamp}`);

      if (!cid) {
        logger.warn(`Outbox: IPFS pinning failed for record ${record.id}. Will retry later.`);
        return; // Stop processing this loop, try again next tick
      }

      // Update to IPFS_COMPLETE
      db.prepare(`UPDATE shipments SET anchoring_status = 'IPFS_COMPLETE', ipfs_cid = ? WHERE id = ?`)
        .run(cid, record.id);

      // 2. Blockchain Anchoring
      let txHash = null;
      if (config.enableBlockchainAnchor) {
        txHash = await BlockchainService.anchorToPolygon(record.hash_chain, cid, record);
        
        if (!txHash) {
          logger.warn(`Outbox: Blockchain anchor failed for record ${record.id}. Will retry later.`);
          return; // Stop processing, retry next tick
        }
      }

      // Update to POLYGON_COMPLETE (or DONE if blockchain is disabled)
      const finalStatus = config.enableBlockchainAnchor ? 'POLYGON_COMPLETE' : 'DONE_NO_BLOCKCHAIN';
      db.prepare(`UPDATE shipments SET anchoring_status = ?, tx_hash = ? WHERE id = ?`)
        .run(finalStatus, txHash, record.id);
      
      logger.info(`Outbox successfully completed processing for record ID ${record.id}`);

    } catch (error) {
      logger.error('Outbox worker encountered an error', error);
      // Wait for next tick to retry. In a production app, you might add a retry_count column.
    }
  }
}

module.exports = new OutboxWorker();
