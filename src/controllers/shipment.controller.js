const db = require('../db/store');
const crypto = require('crypto');
const logger = require('../utils/logger');

// GET /api/shipments/:deviceId/latest
const getLatest = (req, res) => {
  try {
    const { deviceId } = req.params;
    const stmt = db.prepare('SELECT * FROM shipments WHERE device_id = ? ORDER BY id DESC LIMIT 1');
    const record = stmt.get(deviceId);

    if (!record) {
      return res.status(404).json({ ok: false, error: 'No data found for this device' });
    }

    // Parse the payload back to JSON for the frontend
    record.payload = JSON.parse(record.payload);
    
    return res.status(200).json({ ok: true, data: record });
  } catch (error) {
    logger.error('Error fetching latest shipment', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// GET /api/shipments/:deviceId/history
const getHistory = (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const stmt = db.prepare('SELECT * FROM shipments WHERE device_id = ? ORDER BY id DESC LIMIT ?');
    const records = stmt.all(deviceId, limit);

    const formattedRecords = records.map(r => ({
      ...r,
      payload: JSON.parse(r.payload)
    }));
    
    return res.status(200).json({ ok: true, data: formattedRecords });
  } catch (error) {
    logger.error('Error fetching shipment history', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// GET /api/shipments/:deviceId/verify — REAL hash chain verification
const getVerify = (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Retrieve ALL records in order to re-verify the entire chain
    const records = db.prepare(
      'SELECT id, payload, hmac_sha256, hash_chain FROM shipments WHERE device_id = ? ORDER BY id ASC'
    ).all(deviceId);

    if (records.length === 0) {
      return res.status(404).json({ ok: false, error: 'No data found for this device' });
    }

    let expectedPrev = 'GENESIS';
    let brokenAt = null;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const parsed = JSON.parse(r.payload);
      const prevHash = parsed.prev_hash || 'GENESIS';

      // 1. Check prev_hash linkage
      if (prevHash !== expectedPrev) {
        brokenAt = {
          recordIndex: i,
          recordId: r.id,
          reason: `prev_hash mismatch at record ${r.id}. Expected ${expectedPrev.slice(0, 16)}..., got ${prevHash.slice(0, 16)}...`
        };
        break;
      }

      // 2. Recompute hash_chain: SHA256(prev_hash + payload + hmac_sha256)
      const dataToHash = prevHash + r.payload + r.hmac_sha256;
      const computedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      if (computedHash !== r.hash_chain) {
        brokenAt = {
          recordIndex: i,
          recordId: r.id,
          reason: `hash_chain mismatch at record ${r.id}. Computed ${computedHash.slice(0, 16)}..., got ${r.hash_chain.slice(0, 16)}...`
        };
        break;
      }

      expectedPrev = r.hash_chain;
    }

    const isIntact = brokenAt === null;

    return res.status(200).json({
      ok: true,
      integrity_status: isIntact ? 'INTACT' : 'BROKEN',
      total_records_verified: isIntact ? records.length : brokenAt.recordIndex,
      total_records: records.length,
      latest_hash_chain: records[records.length - 1].hash_chain,
      verification_timestamp: new Date().toISOString(),
      ...(brokenAt && { break_point: brokenAt }),
    });
  } catch (error) {
    logger.error('Error verifying shipment', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// GET /api/shipments/:deviceId/stats — Aggregate stats for dashboard
const getStats = (req, res) => {
  try {
    const { deviceId } = req.params;

    const total = db.prepare('SELECT COUNT(*) as count FROM shipments WHERE device_id = ?').get(deviceId)?.count || 0;

    if (total === 0) {
      return res.status(404).json({ ok: false, error: 'No data found for this device' });
    }

    // Anchoring status breakdown
    const anchoring = db.prepare(`
      SELECT anchoring_status, COUNT(*) as count 
      FROM shipments WHERE device_id = ? 
      GROUP BY anchoring_status
    `).all(deviceId);

    const anchoringMap = {};
    anchoring.forEach(a => anchoringMap[a.anchoring_status] = a.count);

    // Temperature stats
    const allPayloads = db.prepare('SELECT payload FROM shipments WHERE device_id = ? ORDER BY id ASC').all(deviceId);
    let temps = [];
    let tamperCount = 0;

    allPayloads.forEach(r => {
      const p = JSON.parse(r.payload);
      if (p.sensors?.temperature_c != null && p.sensors.temperature_c !== -999) {
        temps.push(p.sensors.temperature_c);
      }
      if (p.tamper?.latched || p.tamper?.shock_detected_now || p.tamper?.light_detected_now) {
        tamperCount++;
      }
    });

    const avgTemp = temps.length > 0 ? parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(2)) : null;
    const minTemp = temps.length > 0 ? Math.min(...temps) : null;
    const maxTemp = temps.length > 0 ? Math.max(...temps) : null;

    // Latest record
    const latest = db.prepare('SELECT * FROM shipments WHERE device_id = ? ORDER BY id DESC LIMIT 1').get(deviceId);
    const latestParsed = JSON.parse(latest.payload);

    return res.status(200).json({
      ok: true,
      data: {
        totalPackets: total,
        tamperEvents: tamperCount,
        temperature: { avg: avgTemp, min: minTemp, max: maxTemp, current: latestParsed.sensors?.temperature_c },
        currentState: latestParsed.tamper?.state || 'UNKNOWN',
        gps: latestParsed.gps || null,
        anchoring: anchoringMap,
        latestHash: latest.hash_chain,
        latestTimestamp: latest.timestamp || latest.created_at,
        uptimeMs: latestParsed.uptime_ms,
      }
    });
  } catch (error) {
    logger.error('Error fetching stats', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

module.exports = {
  getLatest,
  getHistory,
  getVerify,
  getStats
};
