const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const outboxWorker = require('./workers/outbox.worker');

const HOST = '0.0.0.0';

app.listen(config.port, HOST, () => {
  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════╗');
  logger.info('║   ILLOGISTICIAN — Cold Chain Tamper Monitor v1.0.0  ║');
  logger.info('╠══════════════════════════════════════════════════════╣');
  logger.info(`║  Mode:      ${config.nodeEnv.padEnd(40)}║`);
  logger.info(`║  Listening: http://${HOST}:${config.port}${' '.repeat(30)}║`);
  logger.info(`║  Dashboard: http://localhost:${config.port}${' '.repeat(24)}║`);
  logger.info(`║  Device:    ${config.allowedDeviceId.padEnd(40)}║`);
  logger.info(`║  IPFS:      ${(config.pinataJwt ? 'Pinata Connected' : 'Disabled').padEnd(40)}║`);
  logger.info(`║  Blockchain:${(config.enableBlockchainAnchor ? ' Enabled' : ' Disabled').padEnd(40)}║`);
  logger.info('╚══════════════════════════════════════════════════════╝');
  logger.info('');
  
  // Start the background worker for async IPFS/Polygon anchoring
  outboxWorker.start();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`, err);
});
