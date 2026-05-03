const express = require('express');
const path = require('path');
const ingestRoutes = require('./routes/ingest.routes');
const shipmentRoutes = require('./routes/shipment.routes');
const custodyRoutes = require('./routes/custody.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Security Middleware ──────────────────────────────────────────
// Payload size limit (prevent DoS via oversized JSON)
app.use(express.json({ limit: '16kb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// CORS for local development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Request ID for traceability
app.use((req, res, next) => {
  const crypto = require('crypto');
  req.id = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ── Static Files (Dashboard) ────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ──────────────────────────────────────────────────
app.use('/api/ingest', ingestRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/custody', custodyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    message: 'Illogistician Cold Chain Monitor — Service Healthy',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// ── Error Handling (must be last) ───────────────────────────────
app.use(errorHandler);

module.exports = app;
