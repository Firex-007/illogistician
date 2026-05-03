const db = require('../db/store');

class ReplayService {
  /**
   * Verifies if the packet is a replay based on timestamp/uptime.
   * @param {string} deviceId - The device ID.
   * @param {string} timestamp - ISO timestamp of the packet.
   * @param {number} uptimeMs - Uptime of the device.
   * @returns {object} - { isReplay: boolean, reason?: string }
   */
  static check(deviceId, timestamp, uptimeMs) {
    const stmt = db.prepare('SELECT timestamp, uptime_ms FROM shipments WHERE device_id = ? ORDER BY id DESC LIMIT 1');
    const lastRecord = stmt.get(deviceId);

    if (!lastRecord) {
      return { isReplay: false }; // First packet
    }

    const incomingTime = new Date(timestamp).getTime();
    const lastTime = new Date(lastRecord.timestamp).getTime();

    // Check if timestamp is explicitly older
    if (incomingTime < lastTime) {
      return { isReplay: true, reason: `Timestamp ${timestamp} is older than last record ${lastRecord.timestamp}` };
    }

    // If timestamp is identical (e.g. sent within the same second), rely on uptime
    if (incomingTime === lastTime) {
      if (uptimeMs <= lastRecord.uptime_ms) {
          return { isReplay: true, reason: `Timestamp is identical and uptime ${uptimeMs} is not strictly greater than last record` };
      }
    }

    // You could also check if the exact payload exists, etc.
    return { isReplay: false };
  }
}

module.exports = ReplayService;
