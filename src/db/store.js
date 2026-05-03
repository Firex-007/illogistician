const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

const dbPath = path.resolve(__dirname, '../../data.db');
let db;

try {
  db = new Database(dbPath);
  logger.info(`Connected to SQLite database at ${dbPath}`);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Initialize shipments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      uptime_ms INTEGER NOT NULL,
      payload TEXT NOT NULL,
      hmac_sha256 TEXT NOT NULL,
      hash_chain TEXT NOT NULL,
      anchoring_status TEXT DEFAULT 'PENDING',
      ipfs_cid TEXT,
      tx_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_device_id ON shipments(device_id);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON shipments(timestamp);
    CREATE INDEX IF NOT EXISTS idx_anchoring_status ON shipments(anchoring_status);
  `);

  // Initialize custody_transfers table
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

  // Safe migration for older DBs — add columns if missing
  const addColumnSafe = (table, column, type) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); } catch (e) { /* exists */ }
  };
  addColumnSafe('shipments', 'anchoring_status', "TEXT DEFAULT 'PENDING'");
  addColumnSafe('shipments', 'ipfs_cid', 'TEXT');
  addColumnSafe('shipments', 'tx_hash', 'TEXT');

  logger.info('Database tables initialized (shipments + custody_transfers)');
} catch (error) {
  logger.error('Failed to initialize database', error);
  process.exit(1);
}

module.exports = db;
