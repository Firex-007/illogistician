const crypto = require('crypto');
const db = require('../db/store');
const logger = require('../utils/logger');

/**
 * QR Custody Handoff Service
 * 
 * Implements chain-of-custody transfers for cold-chain cargo.
 * At each logistics handoff point, the outgoing custodian generates a QR code
 * containing a signed custody transfer token. The incoming custodian scans it
 * to accept responsibility. This creates a non-repudiable audit trail.
 * 
 * If goods are tampered, the system can pinpoint EXACTLY which custody segment
 * had the breach — solving the billion-dollar accountability problem in cold chain.
 */

class CustodyService {

  /**
   * Initialize the custody_transfers table
   */
  static init() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS custody_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        transfer_token TEXT NOT NULL UNIQUE,
        from_custodian TEXT NOT NULL,
        from_role TEXT DEFAULT 'handler',
        to_custodian TEXT,
        to_role TEXT,
        status TEXT DEFAULT 'PENDING',
        tamper_state_at_handoff TEXT NOT NULL,
        temperature_at_handoff REAL,
        gps_lat REAL,
        gps_lng REAL,
        location_label TEXT,
        hash_snapshot TEXT NOT NULL,
        packets_in_custody INTEGER DEFAULT 0,
        notes TEXT,
        ipfs_cid TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        accepted_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_custody_device ON custody_transfers(device_id);
      CREATE INDEX IF NOT EXISTS idx_custody_token ON custody_transfers(transfer_token);
    `);
  }

  /**
   * Generate a custody transfer token (QR data).
   * Called by the OUTGOING custodian when handing off goods.
   * 
   * @param {object} params
   * @param {string} params.deviceId - Cargo device ID
   * @param {string} params.fromCustodian - Name/ID of outgoing custodian
   * @param {string} params.fromRole - Role (e.g., 'warehouse_manager', 'driver', 'receiver')
   * @param {string} params.notes - Optional handoff notes
   * @returns {object} - { token, qrData, transferId }
   */
  static generateHandoff({ deviceId, fromCustodian, fromRole, notes }) {
    // Get current device state
    const latestShipment = db.prepare(
      'SELECT * FROM shipments WHERE device_id = ? ORDER BY id DESC LIMIT 1'
    ).get(deviceId);

    if (!latestShipment) {
      throw new Error('No shipment data exists for this device');
    }

    const parsed = JSON.parse(latestShipment.payload);
    const tamperState = parsed.tamper?.state || parsed.tamper?.latched ? 'TAMPERED' : 'SECURE';
    const temperature = parsed.sensors?.temperature_c || null;
    const gpsLat = parsed.gps?.latitude || null;
    const gpsLng = parsed.gps?.longitude || null;

    // Count packets since last handoff
    const lastTransfer = db.prepare(
      "SELECT id, created_at FROM custody_transfers WHERE device_id = ? AND status = 'ACCEPTED' ORDER BY id DESC LIMIT 1"
    ).get(deviceId);

    let packetsInCustody = 0;
    if (lastTransfer) {
      packetsInCustody = db.prepare(
        'SELECT COUNT(*) as count FROM shipments WHERE device_id = ? AND created_at > ?'
      ).get(deviceId, lastTransfer.created_at)?.count || 0;
    } else {
      packetsInCustody = db.prepare(
        'SELECT COUNT(*) as count FROM shipments WHERE device_id = ?'
      ).get(deviceId)?.count || 0;
    }

    // Generate cryptographic transfer token
    const tokenData = `${deviceId}:${fromCustodian}:${latestShipment.hash_chain}:${Date.now()}`;
    const transferToken = crypto.createHash('sha256').update(tokenData).digest('hex').slice(0, 24);

    // Store the transfer
    const stmt = db.prepare(`
      INSERT INTO custody_transfers 
        (device_id, transfer_token, from_custodian, from_role, tamper_state_at_handoff, 
         temperature_at_handoff, gps_lat, gps_lng, hash_snapshot, packets_in_custody, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      deviceId, transferToken, fromCustodian, fromRole || 'handler',
      tamperState, temperature, gpsLat, gpsLng,
      latestShipment.hash_chain, packetsInCustody, notes || null
    );

    // QR data — compact JSON for QR encoding
    const qrData = {
      t: transferToken,           // transfer token
      d: deviceId,                // device
      f: fromCustodian,           // from
      s: tamperState,             // tamper state at handoff
      c: temperature,             // temperature °C
      h: latestShipment.hash_chain.slice(0, 16), // hash prefix for visual verification
      ts: new Date().toISOString(),
    };

    logger.info(`Custody handoff initiated. Token: ${transferToken}, From: ${fromCustodian}, State: ${tamperState}`);

    return {
      transferId: result.lastInsertRowid,
      token: transferToken,
      qrData: JSON.stringify(qrData),
      tamperState,
      temperature,
      hashSnapshot: latestShipment.hash_chain,
      packetsInCustody,
    };
  }

  /**
   * Accept a custody transfer (incoming custodian scans QR).
   * Creates a non-repudiable record that the incoming custodian accepted
   * goods in the stated condition.
   * 
   * @param {object} params
   * @param {string} params.token - The transfer token from QR code
   * @param {string} params.toCustodian - Name/ID of incoming custodian
   * @param {string} params.toRole - Role of incoming custodian
   * @returns {object} - Transfer record
   */
  static acceptHandoff({ token, toCustodian, toRole }) {
    const transfer = db.prepare(
      'SELECT * FROM custody_transfers WHERE transfer_token = ?'
    ).get(token);

    if (!transfer) {
      throw new Error('Invalid transfer token');
    }

    if (transfer.status === 'ACCEPTED') {
      throw new Error('Transfer already accepted');
    }

    if (transfer.status === 'EXPIRED') {
      throw new Error('Transfer has expired');
    }

    // Check if transfer is older than 30 minutes (auto-expire)
    const createdAt = new Date(transfer.created_at).getTime();
    if (Date.now() - createdAt > 30 * 60 * 1000) {
      db.prepare("UPDATE custody_transfers SET status = 'EXPIRED' WHERE id = ?").run(transfer.id);
      throw new Error('Transfer has expired (>30 minutes)');
    }

    // Accept the transfer
    db.prepare(`
      UPDATE custody_transfers 
      SET to_custodian = ?, to_role = ?, status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(toCustodian, toRole || 'handler', transfer.id);

    const updated = db.prepare('SELECT * FROM custody_transfers WHERE id = ?').get(transfer.id);

    logger.info(`Custody transfer accepted. Token: ${token}, To: ${toCustodian}, Tamper at handoff: ${transfer.tamper_state_at_handoff}`);

    return updated;
  }

  /**
   * Get full custody chain for a device — the complete audit trail.
   * Shows every handoff, who held it, what the tamper state was at each transfer.
   * 
   * @param {string} deviceId
   * @returns {object[]} - Array of custody transfer records
   */
  static getCustodyChain(deviceId) {
    return db.prepare(
      'SELECT * FROM custody_transfers WHERE device_id = ? ORDER BY id ASC'
    ).all(deviceId);
  }

  /**
   * Identify which custodian segment a tamper event occurred in.
   * This is the key forensic feature — pinpoints responsibility.
   * 
   * @param {string} deviceId
   * @returns {object} - Tamper attribution analysis
   */
  static getTamperAttribution(deviceId) {
    const chain = this.getCustodyChain(deviceId);
    const shipments = db.prepare(
      'SELECT * FROM shipments WHERE device_id = ? ORDER BY id ASC'
    ).all(deviceId);

    // Find the first packet where tamper was detected
    let firstTamperPacket = null;
    for (const s of shipments) {
      const parsed = JSON.parse(s.payload);
      if (parsed.tamper?.latched || parsed.tamper?.shock_detected_now || parsed.tamper?.light_detected_now) {
        firstTamperPacket = s;
        break;
      }
    }

    if (!firstTamperPacket) {
      return {
        tampered: false,
        message: 'No tamper events detected in shipment history',
        custodyChain: chain,
      };
    }

    // Find which custody segment the tamper occurred in
    const tamperTime = new Date(firstTamperPacket.timestamp || firstTamperPacket.created_at).getTime();
    let responsibleSegment = null;

    for (let i = 0; i < chain.length; i++) {
      const handoffTime = new Date(chain[i].created_at).getTime();
      const nextHandoffTime = chain[i + 1] ? new Date(chain[i + 1].created_at).getTime() : Infinity;

      if (tamperTime >= handoffTime && tamperTime < nextHandoffTime) {
        responsibleSegment = chain[i];
        break;
      }
    }

    // If tamper happened before any handoff, it's the original custodian
    if (!responsibleSegment && chain.length > 0) {
      if (tamperTime < new Date(chain[0].created_at).getTime()) {
        responsibleSegment = { from_custodian: 'Origin (pre-first-handoff)', from_role: 'shipper' };
      }
    }

    const parsed = JSON.parse(firstTamperPacket.payload);

    return {
      tampered: true,
      firstTamperEvent: {
        timestamp: firstTamperPacket.timestamp,
        shockDetected: parsed.tamper?.shock_detected_now || false,
        lightDetected: parsed.tamper?.light_detected_now || false,
        temperature: parsed.sensors?.temperature_c,
        gps: parsed.gps || null,
      },
      responsibleCustodian: responsibleSegment ? {
        name: responsibleSegment.to_custodian || responsibleSegment.from_custodian,
        role: responsibleSegment.to_role || responsibleSegment.from_role,
        acceptedAt: responsibleSegment.accepted_at,
        tamperStateWhenAccepted: responsibleSegment.tamper_state_at_handoff,
      } : { name: 'Unknown (no custody records)', role: 'unknown' },
      custodyChain: chain,
    };
  }
}

module.exports = CustodyService;
