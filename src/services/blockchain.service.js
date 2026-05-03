const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');

// ABI from BACKEND_INTEGRATION_GUIDE.md (Section 2)
const ABI = [
  "function anchor(string deviceId, string cid, bytes32 payloadHash, bytes32 chainHash, bool tampered, int256 temperatureC)",
  "function getLatest(string deviceId) view returns (tuple(string cid, bytes32 payloadHash, bytes32 chainHash, bool tampered, int256 temperatureC, uint256 timestamp, address recorder))",
  "function getCount(string deviceId) view returns (uint256)",
  "function verifyChain(string deviceId) view returns (bool)",
  "function getTamperHistory(string deviceId) view returns (uint256[])",
];

class BlockchainService {
  /**
   * Anchors the SHA-256 hash chain and IPFS CID to the ColdChain Smart Contract.
   * Calls the anchor() function on Irsha's Hardhat node.
   * @param {string} hashChain - The SHA-256 hash chain of the packet.
   * @param {string} cid - The IPFS CID from Pinata.
   * @param {object} record - The full SQLite record (for device_id, payload, tampered state).
   * @returns {string|null} - The transaction hash or null on failure.
   */
  static async anchorToPolygon(hashChain, cid, record = {}) {
    if (!config.enableBlockchainAnchor) {
      logger.debug('Blockchain anchoring is disabled in config.');
      return null;
    }

    if (!config.amoyRpcUrl || !config.walletPrivateKey) {
      logger.warn('Blockchain config missing (AMOY_RPC_URL or WALLET_PRIVATE_KEY). Skipping anchor.');
      return null;
    }

    if (!config.contractAddress) {
      logger.warn('CONTRACT_ADDRESS not set in config. Skipping anchor.');
      return null;
    }

    try {
      const provider = new ethers.JsonRpcProvider(config.amoyRpcUrl);
      const wallet = new ethers.Wallet(config.walletPrivateKey, provider);
      const contract = new ethers.Contract(config.contractAddress, ABI, wallet);

      // --- Prepare anchor() arguments ---

      // deviceId
      const deviceId = record.device_id || 'cargo-esp32-001';

      // ipfsCid
      const ipfsCid = cid || '';

      // payloadHash: SHA-256 of the raw payload string (as bytes32 via keccak256)
      const payloadStr = record.payload || hashChain;
      const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(payloadStr));

      // chainHash: use our existing hash_chain (it IS the running SHA-256 chain)
      const chainHash = ethers.keccak256(ethers.toUtf8Bytes(hashChain));

      // tampered: read from parsed payload if available
      let tampered = false;
      let temperatureC = 0;
      try {
        const parsed = JSON.parse(record.payload || '{}');
        tampered = parsed.tamper_latched === true || parsed.shock_now === true;
        // Smart contract stores temp × 100 as int256 (e.g. 28.37°C → 2837)
        const temp = parseFloat(parsed.temperature_c || 0);
        temperatureC = Math.round(temp * 100);
      } catch (e) { /* leave defaults */ }

      logger.info(`Anchoring to ColdChain contract. Device: ${deviceId}, Hash: ${hashChain.slice(0, 16)}...`);

      const tx = await contract.anchor(
        deviceId,
        ipfsCid,
        payloadHash,
        chainHash,
        tampered,
        temperatureC
      );

      logger.info(`TX submitted. Waiting for confirmation... Tx: ${tx.hash}`);
      const receipt = await tx.wait(1);
      logger.info(`✅ Anchored in block ${receipt.blockNumber}. Tx: ${receipt.hash}`);

      return receipt.hash;

    } catch (error) {
      logger.error('Blockchain anchoring failed', { message: error.message });
      return null;
    }
  }
}

module.exports = BlockchainService;
