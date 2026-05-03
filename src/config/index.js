require('dotenv').config();

const required = ['HMAC_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  hmacKey: process.env.HMAC_KEY,
  allowedDeviceId: process.env.ALLOWED_DEVICE_ID || 'cargo-esp32-001',
  pinataJwt: process.env.PINATA_JWT,
  amoyRpcUrl: process.env.AMOY_RPC_URL,
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS,
  chainId: process.env.CHAIN_ID || 80002,
  enableBlockchainAnchor: process.env.ENABLE_BLOCKCHAIN_ANCHOR === 'true',
};
