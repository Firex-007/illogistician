const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class IpfsService {
  /**
   * Pins a JSON payload to IPFS using Pinata.
   * @param {object} data - The JSON data to pin (usually the full validated packet).
   * @param {string} name - A descriptive name for the Pinata dashboard.
   * @returns {string|null} - The resulting IPFS CID or null on failure.
   */
  static async pinJSONToIPFS(data, name) {
    if (!config.pinataJwt) {
      logger.warn('Pinata JWT not configured. Skipping IPFS pinning.');
      return null;
    }

    try {
      const payload = {
        pinataOptions: {
          cidVersion: 1
        },
        pinataMetadata: {
          name: name || `cargo_packet_${Date.now()}`
        },
        pinataContent: data
      };

      const res = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.pinataJwt}`
        }
      });

      const cid = res.data.IpfsHash;
      logger.info(`Successfully pinned to IPFS. CID: ${cid}`);
      return cid;
    } catch (error) {
      logger.error('Failed to pin to IPFS via Pinata', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = IpfsService;
