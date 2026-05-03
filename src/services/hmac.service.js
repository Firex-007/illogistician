const crypto = require('crypto');
const config = require('../config');

class HmacService {
  /**
   * Verifies the HMAC-SHA256 signature of a payload.
   * @param {string} payload - The raw JSON string of the payload.
   * @param {string} signature - The expected HMAC signature (hex).
   * @returns {boolean} - True if signature is valid.
   */
  static verify(payload, signature) {
    if (!payload || !signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', config.hmacKey)
      .update(payload)
      .digest('hex');

    // Timing-safe comparison to prevent timing-based side-channel attacks
    if (expectedSignature.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    );
  }
}

module.exports = HmacService;
