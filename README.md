# Illogistician 🛡️

### Decentralized Cold-Chain Cargo Tamper Monitoring & Custody Attribution System

> *Cryptographic proof of who touched your cargo, when, where, and in what condition.*

---

## 🧊 The Problem

**$35 billion** is lost annually in the cold-chain logistics industry due to cargo tampering, temperature excursions, and accountability gaps at handoff points. When perishable goods arrive damaged, the question is always the same:

> *"Who is responsible?"*

Current systems track temperature but **cannot prove custody**. Drivers blame warehouses. Warehouses blame carriers. Nobody can prove anything. Legal disputes drag on for months.

## 💡 The Solution

**Illogistician** is an end-to-end cold-chain monitoring system that combines:

1. **IoT Sensor Monitoring** — Real-time temperature, shock/vibration, and light-breach detection via ESP32 microcontroller
2. **Cryptographic Hash Chain** — Every sensor packet is linked via SHA-256 hash chain. Any data tampering breaks the chain and is immediately detectable
3. **HMAC-SHA256 Authentication** — Each packet is signed with a shared secret, preventing injection attacks. Uses **timing-safe comparison** to prevent side-channel attacks
4. **IPFS Immutable Storage** — Sensor data is pinned to IPFS via Pinata, creating a decentralized, tamper-proof audit trail
5. **QR Custody Handoff** — At each logistics handoff point, custodians generate/scan QR codes to create **non-repudiable custody transfer records**
6. **Tamper Attribution** — When tamper is detected, the system **forensically identifies which custody segment** had the breach — with GPS coordinates, timestamp, and sensor readings as evidence

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌──────────────┐     POST /api/ingest                       │
│  │  ESP32 Sensor │──────────────────────┐                    │
│  │  (or Simulator│                      │                    │
│  └──────────────┘                      ▼                    │
│                                ┌─────────────────┐           │
│  ┌──────────────┐              │  Express Backend │           │
│  │  Dashboard    │◄────────────│                  │           │
│  │  (Browser)    │  GET /api/* │  ✓ HMAC-SHA256   │           │
│  │  localhost:3000│            │  ✓ Hash Chain    │           │
│  └──────────────┘              │  ✓ Replay Guard  │           │
│                                │  ✓ Rate Limiting │           │
│  ┌──────────────┐              │  ✓ SQLite Store  │           │
│  │  QR Custody   │◄────────────│  ✓ Custody Chain │           │
│  │  Handoff      │  POST /api/ │                  │           │
│  └──────────────┘  custody/*   └────────┬─────────┘           │
│                                         │                    │
│                              ┌──────────┴──────────┐         │
│                              │   Outbox Worker      │         │
│                              │   (Async Processing) │         │
│                              └──────────┬──────────┘         │
│                                         │                    │
│                                    ┌────▼────┐               │
│                                    │ Pinata  │               │
│                                    │ (IPFS)  │               │
│                                    │ Cloud ☁️ │               │
│                                    └─────────┘               │
└──────────────────────────────────────────────────────────────┘
```

## 🔐 Security Features

| Feature | Implementation |
|---|---|
| **HMAC-SHA256 Packet Signing** | Every packet signed with shared secret; prevents injection |
| **Timing-Safe HMAC Comparison** | Uses `crypto.timingSafeEqual()` — immune to timing side-channel attacks |
| **SHA-256 Hash Chain** | Each packet links to the previous via hash chain; any modification is detectable |
| **Replay Protection** | Monotonic timestamp + uptime validation prevents packet replay attacks |
| **Rate Limiting** | 100 requests per 15-minute window per IP |
| **Request ID Tracing** | Every request tagged with unique ID for forensic logging |
| **Security Headers** | X-Content-Type-Options, X-Frame-Options, XSS Protection, Referrer-Policy |
| **Payload Size Limiting** | 16KB max to prevent DoS via oversized payloads |
| **Non-Repudiable Custody** | QR handoff tokens are cryptographic — cannot be forged or denied |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/illogistician.git
cd illogistician

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Pinata JWT (optional — system works without it)

# Start the backend + dashboard
npm start

# In a separate terminal, start the ESP32 simulator
npm run simulate
```

### Open the Dashboard
Navigate to **http://localhost:3000** in your browser.

## 📡 API Endpoints

### Ingest (ESP32 → Backend)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ingest` | Submit a signed sensor packet |

### Shipment Data
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/shipments/:deviceId/latest` | Latest sensor reading |
| GET | `/api/shipments/:deviceId/history` | Historical readings (default 50) |
| GET | `/api/shipments/:deviceId/verify` | **Real** hash chain verification |
| GET | `/api/shipments/:deviceId/stats` | Aggregate statistics |

### Custody Handoff
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/custody/handoff` | Generate QR custody transfer |
| POST | `/api/custody/accept` | Accept custody (scan QR) |
| GET | `/api/custody/:deviceId/chain` | Full custody audit trail |
| GET | `/api/custody/:deviceId/attribution` | **Tamper forensic analysis** |

### System
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Service health check |

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** SQLite (via better-sqlite3) — offline-first, zero-config
- **Cryptography:** Node.js `crypto` module (HMAC-SHA256, SHA-256, timing-safe comparison)
- **Decentralized Storage:** IPFS via Pinata API
- **IoT Protocol:** HTTP/JSON with HMAC signing
- **Frontend:** Vanilla HTML/CSS/JS with glassmorphism design
- **QR Codes:** qrcode.js

## 📁 Project Structure

```
illogistician/
├── public/                   # Dashboard (served by Express)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── app.js                # Express app configuration
│   ├── server.js             # Server entry point
│   ├── config/               # Environment configuration
│   ├── controllers/          # Request handlers
│   │   ├── ingest.controller.js
│   │   ├── shipment.controller.js
│   │   └── custody.controller.js
│   ├── services/             # Business logic
│   │   ├── hmac.service.js       # HMAC verification (timing-safe)
│   │   ├── hashchain.service.js  # Hash chain integrity
│   │   ├── replay.service.js     # Replay attack protection
│   │   ├── custody.service.js    # QR custody handoff
│   │   ├── ipfs.service.js       # Pinata IPFS pinning
│   │   └── blockchain.service.js # On-chain anchoring
│   ├── middleware/            # Express middleware
│   │   ├── errorHandler.js
│   │   ├── rateLimit.js
│   │   └── validateBody.js
│   ├── routes/                # API routes
│   ├── db/                    # SQLite store
│   ├── workers/               # Background outbox worker
│   ├── utils/                 # Logger
│   └── simulator/             # ESP32 software simulator
│       └── esp32.simulator.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 👥 Team

- **Member 1** — Backend & IoT Architecture
- **Member 2** — Blockchain & Smart Contract

## 📄 License

ISC
