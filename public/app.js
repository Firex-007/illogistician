/* ═══════════════════════════════════════════════════════════
   ILLOGISTICIAN — Dashboard Application Logic
   Real-time polling, gauge animation, custody management
   ═══════════════════════════════════════════════════════════ */

const DEVICE_ID = 'cargo-esp32-001';
const POLL_INTERVAL = 3000;
const GAUGE_ARC_LENGTH = 251.2; // circumference of the semicircular arc

let lastPacketId = 0;
let eventLog = [];
let isFirstLoad = true;

// ── Route waypoints (must match simulator) ──────────────────
const ROUTE_WAYPOINTS = [
  'Mumbai Warehouse',
  'Navi Mumbai Hub',
  'Khopoli Checkpoint',
  'Lonavala Pass',
  'Talegaon Junction',
  'Pune Distribution',
];

// ── Initialization ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderRouteBar();
  pollData();
  setInterval(pollData, POLL_INTERVAL);
});

// ── Main Polling Loop ───────────────────────────────────────
async function pollData() {
  try {
    const [statsRes, latestRes, historyRes, verifyRes, custodyRes, attrRes] = await Promise.all([
      fetch(`/api/shipments/${DEVICE_ID}/stats`),
      fetch(`/api/shipments/${DEVICE_ID}/latest`),
      fetch(`/api/shipments/${DEVICE_ID}/history?limit=20`),
      fetch(`/api/shipments/${DEVICE_ID}/verify`),
      fetch(`/api/custody/${DEVICE_ID}/chain`),
      fetch(`/api/custody/${DEVICE_ID}/attribution`),
    ]);

    // Connection status
    setConnectionStatus(true);

    if (statsRes.ok) {
      const stats = await statsRes.json();
      if (stats.ok) updateStatusCards(stats.data);
    }

    if (latestRes.ok) {
      const latest = await latestRes.json();
      if (latest.ok) updateGauges(latest.data);
    }

    if (historyRes.ok) {
      const history = await historyRes.json();
      if (history.ok) {
        updateHashChainViz(history.data);
        updateEventFeed(history.data);
      }
    }

    if (verifyRes.ok) {
      const verify = await verifyRes.json();
      if (verify.ok) updateChainIntegrity(verify);
    }

    if (custodyRes.ok) {
      const custody = await custodyRes.json();
      if (custody.ok) updateCustodyChain(custody.data);
    }

    if (attrRes.ok) {
      const attr = await attrRes.json();
      if (attr.ok) updateAttribution(attr.data);
    }

    isFirstLoad = false;

  } catch (err) {
    setConnectionStatus(false);
    console.error('Poll error:', err);
  }
}

// ── Status Cards ────────────────────────────────────────────
function updateStatusCards(data) {
  // Tamper status
  const tamperEl = document.getElementById('tamper-status');
  const tamperGlow = document.getElementById('tamper-glow');
  const isTampered = data.currentState === 'TAMPERED';
  tamperEl.textContent = data.currentState;
  tamperEl.className = `card-value ${isTampered ? 'tampered' : 'secure'}`;
  tamperGlow.className = `status-glow ${isTampered ? 'tampered' : 'secure'}`;

  // Total packets
  document.getElementById('total-packets').textContent = data.totalPackets;

  // IPFS count
  const ipfsCount = (data.anchoring?.IPFS_COMPLETE || 0) +
                    (data.anchoring?.POLYGON_COMPLETE || 0) +
                    (data.anchoring?.DONE_NO_BLOCKCHAIN || 0);
  document.getElementById('ipfs-count').textContent = ipfsCount;

  // GPS
  if (data.gps) {
    document.getElementById('gps-lat').textContent = data.gps.latitude?.toFixed(6) || '—';
    document.getElementById('gps-lng').textContent = data.gps.longitude?.toFixed(6) || '—';
    updateRouteProgress(data.gps.latitude);
  }

  // Temperature stats
  if (data.temperature) {
    document.getElementById('temp-min').textContent = data.temperature.min?.toFixed(1) || '—';
    document.getElementById('temp-avg').textContent = data.temperature.avg?.toFixed(1) || '—';
    document.getElementById('temp-max').textContent = data.temperature.max?.toFixed(1) || '—';
  }
}

// ── Gauges ──────────────────────────────────────────────────
function updateGauges(data) {
  const payload = data.payload;
  if (!payload?.sensors) return;

  // Temperature gauge (-5°C to 45°C range)
  const temp = payload.sensors.temperature_c;
  const tempPct = Math.max(0, Math.min(1, (temp + 5) / 50));
  setGaugeArc('temp-arc', tempPct);
  document.getElementById('temp-value').textContent = temp?.toFixed(1) || '—';

  // Accelerometer gauge (0 to 25 m/s² range)
  const accel = payload.sensors.accel_magnitude;
  const accelPct = Math.max(0, Math.min(1, accel / 25));
  setGaugeArc('accel-arc', accelPct);
  document.getElementById('accel-value').textContent = accel?.toFixed(1) || '—';

  // Light gauge (0 to 4096 range)
  const light = payload.sensors.light_level;
  const lightPct = Math.max(0, Math.min(1, light / 4096));
  setGaugeArc('light-arc', lightPct);
  document.getElementById('light-value').textContent = light || '—';
}

function setGaugeArc(id, pct) {
  const el = document.getElementById(id);
  if (el) {
    el.style.strokeDashoffset = GAUGE_ARC_LENGTH * (1 - pct);
  }
}

// ── Chain Integrity ─────────────────────────────────────────
function updateChainIntegrity(data) {
  const el = document.getElementById('chain-integrity');
  const isIntact = data.integrity_status === 'INTACT';
  el.textContent = isIntact ? `INTACT (${data.total_records_verified})` : 'BROKEN';
  el.className = `card-value ${isIntact ? 'intact' : 'broken'}`;
}

// ── GPS Route Progress Bar ──────────────────────────────────
function renderRouteBar() {
  const container = document.getElementById('gps-route');
  container.innerHTML = '';

  ROUTE_WAYPOINTS.forEach((wp, i) => {
    const point = document.createElement('div');
    point.className = 'route-point';
    point.innerHTML = `<div class="route-dot" id="route-dot-${i}"></div><span class="route-label">${wp}</span>`;
    container.appendChild(point);

    if (i < ROUTE_WAYPOINTS.length - 1) {
      const line = document.createElement('div');
      line.className = 'route-line';
      line.id = `route-line-${i}`;
      container.appendChild(line);
    }
  });
}

function updateRouteProgress(lat) {
  // Map latitude to progress (Mumbai 19.07 → Pune 18.52)
  const startLat = 19.08;
  const endLat = 18.52;
  const progress = Math.max(0, Math.min(1, (startLat - lat) / (startLat - endLat)));
  const activeIndex = Math.floor(progress * (ROUTE_WAYPOINTS.length - 1));

  ROUTE_WAYPOINTS.forEach((_, i) => {
    const dot = document.getElementById(`route-dot-${i}`);
    const line = document.getElementById(`route-line-${i}`);
    if (dot) {
      dot.className = 'route-dot' + (i < activeIndex ? ' visited' : i === activeIndex ? ' active' : '');
    }
    if (line) {
      line.className = 'route-line' + (i < activeIndex ? ' visited' : '');
    }
  });
}

// ── Hash Chain Visualizer ───────────────────────────────────
function updateHashChainViz(history) {
  const container = document.getElementById('hash-chain-viz');
  const records = history.slice().reverse().slice(-10); // last 10, oldest first

  if (records.length === 0) return;

  container.innerHTML = '';

  records.forEach((r, i) => {
    if (i > 0) {
      const link = document.createElement('span');
      link.className = 'hash-link';
      link.textContent = '→';
      container.appendChild(link);
    }

    const block = document.createElement('div');
    block.className = 'hash-block';
    const state = r.payload?.tamper?.state || 'SECURE';
    block.innerHTML = `
      <span class="hash-block-number">#${r.id}</span>
      <span class="hash-block-hash">${r.hash_chain.slice(0, 8)}...${r.hash_chain.slice(-6)}</span>
      <span class="hash-block-state ${state === 'TAMPERED' ? 'tampered' : 'secure'}">${state}</span>
    `;
    container.appendChild(block);
  });
}

// ── Event Feed ──────────────────────────────────────────────
function updateEventFeed(history) {
  const container = document.getElementById('event-feed');
  const newRecords = history.filter(r => r.id > lastPacketId);

  if (newRecords.length > 0 && !isFirstLoad) {
    newRecords.forEach(r => {
      const payload = r.payload;
      const isTamper = payload?.tamper?.shock_detected_now || payload?.tamper?.light_detected_now;
      const time = new Date(r.timestamp || r.created_at).toLocaleTimeString();
      const msg = isTamper
        ? `⚠️ TAMPER: ${payload.tamper.shock_detected_now ? 'Shock' : 'Light'} detected | ${payload.sensors?.temperature_c}°C`
        : `📦 Packet #${r.id} | ${payload.sensors?.temperature_c}°C | ${payload.tamper?.state}`;

      addEvent(time, msg, isTamper ? 'tamper-event' : '');
    });
  }

  if (history.length > 0) {
    lastPacketId = Math.max(...history.map(r => r.id));
  }

  // On first load, show last 5 as initial feed
  if (isFirstLoad && history.length > 0) {
    container.innerHTML = '';
    history.slice(0, 5).forEach(r => {
      const payload = r.payload;
      const isTamper = payload?.tamper?.shock_detected_now || payload?.tamper?.light_detected_now;
      const time = new Date(r.timestamp || r.created_at).toLocaleTimeString();
      const msg = isTamper
        ? `⚠️ TAMPER: ${payload.tamper.shock_detected_now ? 'Shock' : 'Light'} | ${payload.sensors?.temperature_c}°C`
        : `📦 #${r.id} | ${payload.sensors?.temperature_c}°C | ${payload.tamper?.state}`;
      addEvent(time, msg, isTamper ? 'tamper-event' : '');
    });
    lastPacketId = Math.max(...history.map(r => r.id));
  }
}

function addEvent(time, msg, className = '') {
  const container = document.getElementById('event-feed');
  // Remove muted placeholder
  const muted = container.querySelector('.muted');
  if (muted) muted.remove();

  const entry = document.createElement('div');
  entry.className = `event-entry ${className}`;
  entry.innerHTML = `<span class="event-time">${time}</span><span class="event-msg">${msg}</span>`;
  container.insertBefore(entry, container.firstChild);

  // Keep max 30 entries
  while (container.children.length > 30) {
    container.removeChild(container.lastChild);
  }
}

// ── Custody Chain ───────────────────────────────────────────
function updateCustodyChain(chain) {
  const container = document.getElementById('custody-chain');
  if (!chain || chain.length === 0) return;

  container.innerHTML = '';

  chain.forEach(c => {
    const entry = document.createElement('div');
    entry.className = `custody-entry ${c.status.toLowerCase()}`;
    const isTampered = c.tamper_state_at_handoff === 'TAMPERED';
    const time = new Date(c.created_at).toLocaleString();
    
    entry.innerHTML = `
      <span class="custody-icon">${c.status === 'ACCEPTED' ? '✅' : '⏳'}</span>
      <div class="custody-details">
        <span class="custody-names">${c.from_custodian} (${c.from_role}) → ${c.to_custodian || '???'} (${c.to_role || '—'})</span>
        <span class="custody-meta">${time} | Token: ${c.transfer_token.slice(0, 12)}...</span>
      </div>
      <span class="custody-state ${isTampered ? 'tampered' : 'secure'}">${c.tamper_state_at_handoff}</span>
    `;
    container.appendChild(entry);
  });
}

// ── Tamper Attribution ──────────────────────────────────────
function updateAttribution(data) {
  const card = document.getElementById('attribution-card');
  const content = document.getElementById('attribution-content');

  if (!data.tampered) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';
  content.innerHTML = `
    <div class="attr-row">
      <span class="attr-label">Status</span>
      <span class="attr-value danger">⚠️ TAMPER DETECTED</span>
    </div>
    <div class="attr-row">
      <span class="attr-label">First Event</span>
      <span class="attr-value">${new Date(data.firstTamperEvent?.timestamp).toLocaleString()}</span>
    </div>
    <div class="attr-row">
      <span class="attr-label">Type</span>
      <span class="attr-value">${data.firstTamperEvent?.shockDetected ? '💥 Shock/Impact' : ''}${data.firstTamperEvent?.lightDetected ? '💡 Light Breach (container opened)' : ''}</span>
    </div>
    <div class="attr-row">
      <span class="attr-label">Temperature</span>
      <span class="attr-value">${data.firstTamperEvent?.temperature}°C at time of event</span>
    </div>
    ${data.firstTamperEvent?.gps ? `
    <div class="attr-row">
      <span class="attr-label">Location</span>
      <span class="attr-value mono">${data.firstTamperEvent.gps.latitude}, ${data.firstTamperEvent.gps.longitude}</span>
    </div>` : ''}
    <div class="attr-row">
      <span class="attr-label">Responsible</span>
      <span class="attr-value danger">${data.responsibleCustodian?.name || 'Unknown'} (${data.responsibleCustodian?.role || '—'})</span>
    </div>
    <div class="attr-row">
      <span class="attr-label">Accepted State</span>
      <span class="attr-value">${data.responsibleCustodian?.tamperStateWhenAccepted || 'N/A'}</span>
    </div>
  `;
}

// ── QR Handoff Functions ────────────────────────────────────
async function initiateHandoff() {
  const fromCustodian = document.getElementById('from-custodian').value.trim();
  const fromRole = document.getElementById('from-role').value;
  const notes = document.getElementById('handoff-notes').value.trim();

  if (!fromCustodian) {
    showToast('Please enter your name/ID', 'error');
    return;
  }

  try {
    const res = await fetch('/api/custody/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        fromCustodian,
        fromRole,
        notes: notes || undefined,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error, 'error');
      return;
    }

    // Show QR code
    document.getElementById('handoff-initiate').style.display = 'none';
    document.getElementById('handoff-accept').style.display = 'none';
    const qrDisplay = document.getElementById('qr-display');
    qrDisplay.style.display = '';

    document.getElementById('qr-token-display').textContent = `Token: ${data.data.token}`;

    // Generate QR code
    const canvas = document.getElementById('qr-canvas');
    canvas.innerHTML = '';
    
    // Foolproof image-based QR using qrserver API
    const qrImage = document.createElement('img');
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=22d3ee&bgcolor=0a0e1a&data=${encodeURIComponent(data.data.qrData)}`;
    qrImage.style.borderRadius = '12px';
    qrImage.style.margin = '10px auto';
    qrImage.style.display = 'block';
    canvas.appendChild(qrImage);

    addEvent(new Date().toLocaleTimeString(), `🔄 Custody handoff initiated by ${fromCustodian}`, 'custody-event');
    showToast('QR code generated! Share with incoming custodian.', 'success');
  } catch (err) {
    showToast('Failed to initiate handoff', 'error');
  }
}

function closeQR() {
  document.getElementById('qr-display').style.display = 'none';
  document.getElementById('handoff-initiate').style.display = '';
  document.getElementById('handoff-accept').style.display = '';
}

async function acceptHandoff() {
  const token = document.getElementById('accept-token').value.trim();
  const toCustodian = document.getElementById('to-custodian').value.trim();
  const toRole = document.getElementById('to-role').value;

  if (!token || !toCustodian) {
    showToast('Please enter token and your name/ID', 'error');
    return;
  }

  try {
    const res = await fetch('/api/custody/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, toCustodian, toRole }),
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error, 'error');
      return;
    }

    addEvent(new Date().toLocaleTimeString(), `✅ Custody accepted by ${toCustodian}`, 'custody-event');
    showToast('Custody accepted! You are now responsible.', 'success');

    // Clear inputs
    document.getElementById('accept-token').value = '';
    document.getElementById('to-custodian').value = '';

    // Refresh data immediately
    pollData();
  } catch (err) {
    showToast('Failed to accept handoff', 'error');
  }
}

// ── Connection Status ───────────────────────────────────────
function setConnectionStatus(connected) {
  const badge = document.getElementById('connection-status');
  if (connected) {
    badge.className = 'connection-badge';
    badge.innerHTML = '<span class="pulse-dot"></span><span>Live</span>';
  } else {
    badge.className = 'connection-badge error';
    badge.innerHTML = '<span class="pulse-dot"></span><span>Disconnected</span>';
  }
}

// ── Toast Notifications ─────────────────────────────────────
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
