const crypto = require('crypto');
const db = require('../db/store');

class HashChainService {
  /**
   * Verifies the continuity of the hash chain.
   * @param {string} deviceId - The device ID.
   * @param {string} prevHash - The prev_hash field from the incoming payload.
   * @param {string} payload - The raw JSON string payload.
   * @param {string} signature - The hmac_sha256 signature of the packet.
   * @param {string} incomingHashChain - The hash_chain from the incoming packet.
   * @returns {object} - { isValid: boolean, reason?: string }
   */
  static verify(deviceId, prevHash, payload, signature, incomingHashChain) {
    // Get the latest hash_chain for this device
    const stmt = db.prepare('SELECT hash_chain FROM shipments WHERE device_id = ? ORDER BY id DESC LIMIT 1');
    const lastRecord = stmt.get(deviceId);
    
    const expectedPrevHash = lastRecord ? lastRecord.hash_chain : 'GENESIS';

    if (prevHash !== expectedPrevHash) {
      return { isValid: false, reason: `prev_hash mismatch. Expected ${expectedPrevHash}, got ${prevHash}` };
    }

    // Recompute current hash: SHA256(prev_hash + payload + signature)
    const dataToHash = prevHash + payload + signature;
    const computedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    if (computedHash !== incomingHashChain) {
      return { isValid: false, reason: `hash_chain mismatch. Computed ${computedHash}, got ${incomingHashChain}` };
    }

    return { isValid: true };
  }
}

module.exports = HashChainService;
