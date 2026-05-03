const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const URL = 'http://127.0.0.1:3000/api/ingest';
const HMAC_KEY = process.env.HMAC_KEY || '4273d3f494fa6a4552fa5bfc60c2d95dfa26ab621c6bdeb4e67a75e7c3976186';
const DEVICE_ID = 'cargo-esp32-001';

async function testValidPacket() {
  console.log('\n--- Test: Valid Packet ---');
  
  const payloadObj = {
    device_id: DEVICE_ID,
    timestamp: new Date().toISOString(),
    uptime_ms: 1000,
    sensors: { temperature_c: 25.5, light_level: 100, accel_magnitude: 9.81 },
    tamper: { shock_detected_now: false, light_detected_now: false, latched: false, state: "SECURE" },
    prev_hash: "GENESIS"
  };

  const payloadStr = JSON.stringify(payloadObj);
  const hmac_sha256 = crypto.createHmac('sha256', HMAC_KEY).update(payloadStr).digest('hex');
  const hash_chain = crypto.createHash('sha256').update("GENESIS" + payloadStr + hmac_sha256).digest('hex');

  const reqBody = { payload: payloadStr, hmac_sha256, hash_chain };

  try {
    const res = await axios.post(URL, reqBody);
    console.log('Response:', res.status, res.data);
  } catch (err) {
    console.error('Error:', err.response?.status, err.response?.data || err.message);
  }
}

async function run() {
  await testValidPacket();
}

run();
