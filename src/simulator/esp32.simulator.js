/**
 * ESP32 Software Simulator
 * Generates cryptographically identical packets to the real ESP32 hardware.
 * Simulates realistic cold-chain cargo monitoring with:
 *   - Temperature drift (refrigerated goods ~2-4°C baseline)
 *   - Accelerometer noise with occasional shock spikes
 *   - Light level (near-zero sealed, spikes on open)
 *   - GPS coordinates along a realistic delivery route
 *   - Tamper scenario triggers at defined intervals
 *   - HMAC-SHA256 signing + SHA-256 hash chain (identical to firmware)
 */

const crypto = require('crypto');
const http = require('http');

// ── Config (mirrors ESP32 firmware) ──────────────────────────────
const DEVICE_ID = 'cargo-esp32-001';
const HMAC_KEY = process.env.HMAC_KEY || '4273d3f494fa6a4552fa5bfc60c2d95dfa26ab621c6bdeb4e67a75e7c3976186';
const SERVER_URL = process.env.SIMULATOR_TARGET || 'http://127.0.0.1:3000';
const SEND_INTERVAL_MS = parseInt(process.env.SIMULATOR_INTERVAL || '5000');

const LIGHT_THRESHOLD = 2000;
const SHOCK_THRESHOLD = 15.0;

// ── Simulated GPS Route (Mumbai → Pune cold-chain corridor) ─────
const ROUTE_WAYPOINTS = [
  { lat: 19.0760, lng: 72.8777, label: 'Mumbai Warehouse' },
  { lat: 19.0330, lng: 73.0297, label: 'Navi Mumbai Hub' },
  { lat: 18.8529, lng: 73.2806, label: 'Khopoli Checkpoint' },
  { lat: 18.7167, lng: 73.4833, label: 'Lonavala Pass' },
  { lat: 18.6298, lng: 73.7997, label: 'Talegaon Junction' },
  { lat: 18.5204, lng: 73.8567, label: 'Pune Distribution Center' },
];

// ── Runtime State ────────────────────────────────────────────────
let previousHash = 'GENESIS';
let tamperLatched = false;
let packetCount = 0;
let startTime = Date.now();
let currentTemp = 2.5 + (Math.random() * 1.5); // Start at ~2.5-4°C (cold chain)
let routeProgress = 0; // 0.0 to 1.0

// ── Tamper Scenarios (trigger at specific packet numbers) ────────
const TAMPER_SCENARIOS = {
  8:  { type: 'shock', desc: 'Rough handling during loading' },
  15: { type: 'light', desc: 'Container opened at checkpoint' },
  22: { type: 'temp_drift', desc: 'Refrigeration unit failure' },
};

// ── Crypto Functions (identical to ESP32 firmware) ───────────────
function hmacSHA256(message, key) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ── Sensor Simulation ───────────────────────────────────────────
function simulateTemperature(packetNum) {
  // Normal drift: ±0.3°C random walk
  const drift = (Math.random() - 0.5) * 0.6;
  currentTemp += drift;

  // Scenario: refrigeration failure causes steady rise
  if (packetNum >= 22) {
    currentTemp += 0.4; // Rising 0.4°C per reading
  }

  // Clamp to realistic range
  currentTemp = Math.max(-5, Math.min(45, currentTemp));
  return parseFloat(currentTemp.toFixed(2));
}

function simulateAcceleration(packetNum) {
  // Baseline: ~9.81 m/s² (gravity) with small vibration noise
  const baseline = 9.81;
  const noise = (Math.random() - 0.5) * 0.8;
  let accel = baseline + noise;

  // Scenario: shock event
  if (TAMPER_SCENARIOS[packetNum]?.type === 'shock') {
    accel = SHOCK_THRESHOLD + 2 + (Math.random() * 5); // 17-22 m/s²
  }

  return parseFloat(accel.toFixed(2));
}

function simulateLightLevel(packetNum) {
  // Sealed container: 10-80 (ambient sensor noise)
  let light = Math.floor(10 + Math.random() * 70);

  // Scenario: container opened
  if (TAMPER_SCENARIOS[packetNum]?.type === 'light') {
    light = LIGHT_THRESHOLD + 500 + Math.floor(Math.random() * 1000); // 2500-3500
  }

  return light;
}

function simulateGPS() {
  // Interpolate along route based on progress
  routeProgress = Math.min(1.0, routeProgress + (0.02 + Math.random() * 0.03));

  const totalSegments = ROUTE_WAYPOINTS.length - 1;
  const rawIndex = routeProgress * totalSegments;
  const segIndex = Math.min(Math.floor(rawIndex), totalSegments - 1);
  const segFraction = rawIndex - segIndex;

  const from = ROUTE_WAYPOINTS[segIndex];
  const to = ROUTE_WAYPOINTS[Math.min(segIndex + 1, totalSegments)];

  return {
    latitude: parseFloat((from.lat + (to.lat - from.lat) * segFraction).toFixed(6)),
    longitude: parseFloat((from.lng + (to.lng - from.lng) * segFraction).toFixed(6)),
    label: segFraction < 0.5 ? from.label : to.label,
  };
}

// ── Build & Send Packet ─────────────────────────────────────────
function buildAndSendPacket() {
  packetCount++;
  const uptimeMs = Date.now() - startTime;
  const timestamp = new Date().toISOString();

  // Simulate sensors
  const temperature_c = simulateTemperature(packetCount);
  const accel_magnitude = simulateAcceleration(packetCount);
  const light_level = simulateLightLevel(packetCount);
  const gps = simulateGPS();

  // Detect tamper
  const shock_now = accel_magnitude > SHOCK_THRESHOLD;
  const light_now = light_level > LIGHT_THRESHOLD;
  if (shock_now || light_now) tamperLatched = true;

  // Build payload (identical structure to ESP32 firmware)
  const payloadObj = {
    device_id: DEVICE_ID,
    timestamp: timestamp,
    uptime_ms: uptimeMs,
    seq: packetCount,
    sensors: {
      temperature_c,
      light_level,
      accel_magnitude,
    },
    gps: {
      latitude: gps.latitude,
      longitude: gps.longitude,
    },
    tamper: {
      shock_detected_now: shock_now,
      light_detected_now: light_now,
      latched: tamperLatched,
      state: tamperLatched ? 'TAMPERED' : 'SECURE',
    },
    prev_hash: previousHash,
  };

  const payload = JSON.stringify(payloadObj);

  // HMAC sign (identical to ESP32)
  const signature = hmacSHA256(payload, HMAC_KEY);

  // Hash chain (identical to ESP32: SHA256(prev_hash + payload + signature))
  const currentHash = sha256(previousHash + payload + signature);
  previousHash = currentHash;

  // Build final packet envelope
  const packet = JSON.stringify({
    payload: payload,
    hmac_sha256: signature,
    hash_chain: currentHash,
  });

  // Console output
  const scenario = TAMPER_SCENARIOS[packetCount];
  console.log('══════════════════════════════════════════════════');
  console.log(`  Packet #${packetCount} | ${timestamp}`);
  console.log(`  Temp: ${temperature_c}°C | Light: ${light_level} | Accel: ${accel_magnitude} m/s²`);
  console.log(`  GPS: ${gps.latitude}, ${gps.longitude} (${gps.label})`);
  console.log(`  Tamper: ${tamperLatched ? '🔴 TAMPERED' : '🟢 SECURE'}${shock_now ? ' [SHOCK!]' : ''}${light_now ? ' [LIGHT!]' : ''}`);
  console.log(`  Hash: ${currentHash.slice(0, 32)}...`);
  if (scenario) {
    console.log(`  ⚠️  SCENARIO: ${scenario.desc}`);
  }
  console.log('══════════════════════════════════════════════════');

  // POST to backend
  const url = new URL('/api/ingest', SERVER_URL);
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(packet),
    },
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`  ✅ Accepted by backend`);
      } else {
        console.log(`  ❌ Rejected (${res.statusCode}): ${body}`);
      }
      console.log('');
    });
  });

  req.on('error', (err) => {
    console.log(`  ❌ Connection failed: ${err.message}`);
    console.log('');
  });

  req.write(packet);
  req.end();
}

// ── Main ─────────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║     ESP32 CARGO MONITOR — SOFTWARE SIMULATOR    ║');
console.log('╠══════════════════════════════════════════════════╣');
console.log(`║  Device:   ${DEVICE_ID}                  ║`);
console.log(`║  Target:   ${SERVER_URL.padEnd(37)}║`);
console.log(`║  Interval: ${String(SEND_INTERVAL_MS).padEnd(37)}║`);
console.log('║  Route:    Mumbai → Pune cold-chain corridor    ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log('Tamper scenarios will trigger at packets #8, #15, #22');
console.log('Starting in 2 seconds...');
console.log('');

setTimeout(() => {
  buildAndSendPacket(); // First packet immediately
  setInterval(buildAndSendPacket, SEND_INTERVAL_MS);
}, 2000);
