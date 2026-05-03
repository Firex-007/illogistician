const crypto = require('crypto');
const http = require('http');

const HMAC_KEY = '4273d3f494fa6a4552fa5bfc60c2d95dfa26ab621c6bdeb4e67a75e7c3976186';
const DEVICE_ID = 'cargo-esp32-001';

// Build a realistic payload string (exactly as ESP32 would)
const payloadObj = {
  temperature_c: 28.37,
  light_level: 103,
  accel_magnitude: 9.81,
  shock_now: false,
  light_tamper: false,
  tamper_latched: false
};
const payload = JSON.stringify(payloadObj);

const timestamp = new Date().toISOString().slice(0, 19);
const uptime_ms = 15000;
const prev_hash = 'GENESIS';

// HMAC
const hmac = crypto.createHmac('sha256', HMAC_KEY).update(payload).digest('hex');

// Hash chain: SHA256(prev_hash + hmac)
const hash_chain = crypto.createHash('sha256').update(prev_hash + hmac).digest('hex');

const body = JSON.stringify({
  device_id: DEVICE_ID,
  timestamp,
  uptime_ms,
  payload,
  prev_hash,
  hmac_sha256: hmac,
  hash_chain
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/ingest',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log(`HTTP ${res.statusCode}:`, data);
  });
});

req.write(body);
req.end();
