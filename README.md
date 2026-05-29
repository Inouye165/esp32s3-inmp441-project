# ESP32-S3 · INMP441 Audio Streamer

Real-time audio streaming dashboard for the ESP32-S3 + INMP441 I²S microphone.
The ESP32 is a **dumb streamer** — it reads raw PCM over I²S and pushes it to
the desktop server over a persistent TCP connection. All recording, waveform
display, dBFS computation, and future analysis live on the server.

```
┌─────────────┐   I²S    ┌──────────┐  TCP raw PCM  ┌─────────────────┐   SSE/HTTP
│   INMP441   │ ────────▶│ ESP32-S3 │ ─────────────▶│  Desktop Server │◀────────── Browser
│  Microphone │          │ Streamer │  16 kHz int16  │  (TypeScript)   │
└─────────────┘          └──────────┘                └─────────────────┘
```

> 📖 **For detailed setup instructions, troubleshooting, and architecture details, see [SETUP.md](SETUP.md)**

## Features

✅ Real-time audio streaming (TCP, 16 kHz mono PCM)  
✅ Live waveform visualization (Server-Sent Events)  
✅ Hourly WAV file recording with HTTP Range playback  
✅ Multi-unit support (2+ ESP32s simultaneously)  
✅ Module registry with photos and metadata  
✅ Network health check (WiFi SSID validation)  
✅ Auto-reconnect with exponential backoff  
✅ Zero-fill gap handling (maintains time alignment)  
✅ Tabbed web UI (Dashboard, Modules, Playback)  
✅ RESTful API with JSON responses  
✅ Jest test suite (unit + integration tests)  

## 🚀 Quick Commands

```bash
# Start the server (development mode with hot reload)
cd server
npm run dev

# Server runs at: http://localhost:3000

# Restart server (if already running)
# Windows PowerShell:
netstat -ano | findstr :3000              # Find PID
taskkill /PID <PID> /F                    # Kill process (replace <PID>)
cd c:\Users\inouy\electronic_projects\esp\esp32s3-inmp441-project\server
npm run dev                               # Start again

# Flash ESP32 firmware
cd firmware
pio run --target upload                   # Upload to connected ESP32
pio device monitor                        # View serial output

# Run tests
cd server
npm test                                  # Run all Jest tests
```

### Streaming protocol

| Field | Value |
|-------|-------|
| Transport | Raw TCP (persistent connection) |
| Port | `8001` (server-side listener) |
| Preamble | 8 bytes: `PCM1` magic (LE u32) + sample rate (LE u32) |
| Payload | int16 LE mono PCM, continuous |
| Sample rate | 16 000 Hz |
| Gain | 32× (24→16 bit conversion + level boost) |

## Wiring  —  ESP32-S3-WROOM-1 (N16R8)

| INMP441 | ESP32-S3 GPIO | Wire color | Notes |
|---------|---------------|------------|-------|
| VDD     | 3V3           | 🟥 Red    | **Do not use 5 V** |
| GND     | GND           | ⬛ Black  | |
| L/R     | GND           | 🟩 Green  | Selects LEFT channel |
| SCK     | **GPIO 4**    | 🟧 Orange | Bit clock (BCLK) |
| WS      | **GPIO 5**    | 🟨 Yellow | Word select (LRCLK) |
| SD      | **GPIO 6**    | 🟫 Brown  | Serial data out (DOUT) |

**Why these pins?** GPIO 4/5/6 are all on the same side of the WROOM-1 module
and avoid every reserved function on the N16R8 variant:
- Not strapping pins (0, 3, 45, 46)
- Not octal flash/PSRAM (internal: 26–37 — not broken out anyway)
- Not native USB (19, 20)
- Not UART0 monitor (43, 44)

If you need to relocate, any of GPIO **7–18** are equally safe.
Avoid GPIO 19/20 (USB), 26–37 (flash/PSRAM), 43/44 (UART), 45/46 (strap).

## Project Structure

```
├── firmware/                   # PlatformIO / Arduino — ESP32 streaming firmware
│   ├── platformio.ini         # Build config for ESP32-S3 + ESP32 Classic
│   ├── include/
│   │   ├── config.h           # Pin definitions, I²S settings, stream config
│   │   ├── secrets.h          # WiFi credentials + STREAM_HOST (gitignored)
│   │   └── secrets.h.example  # Template for secrets.h
│   ├── src/                   # ESP32-S3 sources (default)
│   │   ├── main.cpp           # setup(): WiFi → micInit → HTTP → stream task
│   │   ├── wifi_manager.*     # WiFi connection helper
│   │   ├── i2s_microphone.*   # I²S driver + DC blocker
│   │   ├── audio_stream.*     # TCP streaming task (sole I²S owner)
│   │   └── http_api.*         # /api/info and /api/health endpoints
│   └── src_esp32classic/      # Classic ESP32 sources (Unit 2)
│       └── (similar structure with adjusted pins/config)
│
├── server/                     # TypeScript / Express — dashboard + ingest
│   ├── package.json           # Dependencies + scripts
│   ├── tsconfig.json          # TypeScript compiler config
│   ├── jest.config.ts         # Jest test configuration
│   ├── src/
│   │   ├── server.ts          # Entry point
│   │   ├── app.ts             # Express app factory
│   │   ├── config.ts          # Runtime + env config
│   │   ├── routes/api.ts      # REST + SSE endpoints
│   │   ├── services/
│   │   │   ├── audioIngest.ts         # TCP listener, PCM→dBFS, rolling WAV
│   │   │   ├── audioIngestClassic.ts  # Unit 2 ingest service
│   │   │   ├── esp32Service.ts        # Typed fetch helpers for /api/info
│   │   │   ├── moduleRegistry.ts      # JSON-persisted module registry
│   │   │   └── networkChecker.ts      # WiFi SSID validation
│   │   ├── middleware/        # Express middleware
│   │   └── types/index.ts     # Shared TypeScript interfaces
│   ├── public/                # Web dashboard (static files)
│   │   ├── index.html         # Main dashboard (tabbed UI)
│   │   ├── module.html        # Full module detail view
│   │   ├── network-check.html # Network validation page
│   │   ├── uploads/           # Module photos (served statically)
│   │   ├── js/app.js          # Dashboard + modules logic
│   │   ├── css/               # Stylesheets
│   │   └── lib/               # Third-party libraries (Chart.js, Bootstrap)
│   ├── data/                  # Runtime data (gitignored)
│   │   └── modules.json       # Module registry persistence
│   ├── recordings/            # Audio files (gitignored)
│   │   └── stream/            # Hourly WAV files + index.jsonl
│   └── tests/                 # Jest unit tests
│       ├── esp32Service.test.ts
│       └── routes.test.ts
│
├── SETUP.md                    # Complete setup guide + troubleshooting
└── README.md                   # This file
```

## Quick Start

> 📖 **First time setup?** Follow the complete guide in [SETUP.md](SETUP.md)

### 1 — Configure secrets

```bash
# Copy example file
cd firmware/include
cp secrets.h.example secrets.h

# Edit firmware/include/secrets.h (gitignored)
#define WIFI_SSID     "your-network"
#define WIFI_PASSWORD "your-password"
#define STREAM_HOST   "192.168.1.100"   # Your desktop's local IP
```

**Finding your desktop IP:**
- Windows: `ipconfig` (look for IPv4 Address)
- macOS/Linux: `ifconfig` or `ip addr`

### 2 — Flash the ESP32

```bash
cd firmware
pio run --target upload
pio device monitor               # watch serial for WiFi IP + stream connection
```

### 3 — Start the desktop server

```bash
cd server
npm install          # First time only
npm run dev          # Start with hot reload
```

Server runs at: **http://localhost:3000**

**TCP ingest ports:**
- Port **8001** — ESP32-S3 Unit 1 (primary)
- Port **8002** — ESP32 Classic Unit 2 (optional)

#### Optional Configuration

Create `server/.env` or `server/.env.local` to customize:

```bash
# Server HTTP port
PORT=3000

# TCP audio streaming
STREAM_INGEST_ENABLED=true
STREAM_INGEST_PORT=8001

STREAM_INGEST2_ENABLED=false    # Enable Unit 2
STREAM_INGEST2_PORT=8002

# Archive settings
RECORDINGS_DIR=./recordings
ARCHIVE_CHUNK_MS=2000

# ESP32 IP (optional, can set via UI)
ESP32_IP=192.168.1.50
ESP32_PORT=80
```

**Restart server** (if already running):
```bash
# Windows PowerShell:
netstat -ano | findstr :3000    # Find PID
taskkill /PID <PID> /F          # Kill process

# Then start again:
npm run dev
```

### 4 — Tests

```bash
cd server
npm test
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Firmware** | C++ · Arduino framework · ESP-IDF · FreeRTOS |
| **Audio driver** | ESP32 I²S driver (`driver/i2s.h`) |
| **Device HTTP** | ESP32 `WebServer` · ArduinoJson 7 |
| **Transport** | Raw TCP, int16 LE PCM, 8-byte preamble |
| **Server runtime** | Node.js 20+ · TypeScript 5 · Express 4 |
| **File uploads** | Multer with diskStorage (5 MB limit) |
| **Audio ingest** | `net.Server` TCP listener, rolling WAV files |
| **Live waveform** | SSE (`text/event-stream`) · Chart.js 4 |
| **Testing** | Jest · ts-jest · Supertest |
| **Frontend** | Bootstrap 5 · Chart.js 4 · Vanilla JS |
| **Build tools** | PlatformIO · ts-node-dev · tsc |

## API Reference

> 📖 **Complete API documentation in [SETUP.md](SETUP.md#api-reference)**

### Server Quick Reference

### Server Quick Reference

**Core endpoints:**
- `GET /api/health` — Server uptime + ingest status
- `GET /api/ingest/status` — TCP connection status, sample rate, bytes received
- `GET /api/ingest/stream` — SSE stream of live dBFS samples (waveform data)
- `GET /api/ingest/hours` — List recorded hour files
- `GET /api/modules` — List all ESP32 modules
- `POST /api/modules/:id/upload` — Upload module photo

**ESP32 endpoints:**
- `GET /` — Plain text "OK"
- `GET /api/info` — Board metadata (name, firmware version, mic type)
- `GET /api/health` — Uptime, WiFi RSSI, streaming status

## Dashboard Features

### Main Dashboard Tab
- **Live waveform** — Real-time dBFS visualization via SSE
- **Connection status** — Shows TCP connection state for both units
- **Audio controls** — Start/stop recording, playback controls
- **Network indicator** — Current WiFi SSID and connection status

### Modules Tab
- **Module cards** — Visual grid of all ESP32 devices
- **Photo uploads** — Drag-and-drop or file picker (≤5 MB)
- **Quick modal** — Click card for identity, IP config, LED controls
- **Full detail view** — Complete specs with GPIO pinout tables
- **LED proxy** — Send ON/OFF/BLINK commands to compatible modules
- **Security** — Private IP validation (SSRF protection)

### Playback Tab
- **Hour file browser** — List and play recorded sessions
- **HTTP Range support** — Seek/scrub through long recordings
- **Time-aligned playback** — Matches wall-clock time to audio offset

## Known Issues & Improvements Needed

> 📖 **Complete list in [SETUP.md](SETUP.md#known-issues--limitations)**

### ⚠️ Not Best Practices

1. **No authentication** — API is wide open (LAN-only assumed)
2. **No TLS/HTTPS** — Plain HTTP traffic (unsuitable for public networks)
3. **Hardcoded WiFi credentials** — Should use WiFi provisioning (BLE, Captive Portal)
4. **Flat JSON file for modules** — No database, no transactions, corruption risk
5. **Minimal error handling** — Server crashes can orphan TCP sockets
6. **Fixed sample rate** — 16 kHz hardcoded, no negotiation
7. **No rate limiting** — API can be spammed (DoS risk)
8. **Loose TypeScript typing** — Some `any` types, should be strict
9. **Incomplete test coverage** — No integration tests for TCP streaming

### 🚀 High-Priority Improvements

1. **Add authentication** (JWT tokens, session-based auth)
2. **WiFi provisioning** (BLE or SoftAP captive portal)
3. **Database migration** (SQLite + Prisma ORM)
4. **HTTPS support** (self-signed or Let's Encrypt)
5. **Graceful shutdown** (flush WAV headers, close sockets)
6. **Error recovery** (circuit breakers, exponential backoff)

### 🎨 Nice-to-Have Features

- **Audio analysis** (FFT, spectrograms, VAD)
- **WebSocket alternative** (replace SSE for bidirectional comms)
- **Cloud storage** (S3/Azure Blob for hour files)
- **Multi-room support** (room tagging, synchronized playback)
- **Docker deployment** (one-command startup)
- **CI/CD pipeline** (GitHub Actions for tests + firmware builds)

## Development

### Running Tests

```bash
cd server
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Building for Production

```bash
cd server
npm run build               # Compile TypeScript → dist/
npm start                   # Run compiled server
```

### Linting

```bash
cd server
npm run lint                # ESLint check
```

### Firmware Development

```bash
cd firmware
pio run --target upload     # Flash firmware
pio device monitor          # Serial monitor (Ctrl+C to exit)

# Build without uploading:
pio run

# Clean build:
pio run --target clean
```

## Troubleshooting

> 📖 **Full troubleshooting guide in [SETUP.md](SETUP.md#troubleshooting)**

**Common issues:**

- **ESP32 won't connect to WiFi** → Check SSID/password, verify 2.4 GHz network
- **Server shows "Connection refused"** → Check firewall, verify `STREAM_HOST` IP
- **No waveform in browser** → Check `/api/ingest/status`, verify ESP32 connection
- **Choppy playback** → Low WiFi signal, server CPU overload, or large file

## Contributing

Contributions welcome! Please:
- Follow existing code style
- Add tests for new features
- Update documentation
- Submit pull requests to `main` branch

## License

*(Specify your license here — MIT, Apache 2.0, etc.)*

---

**Firmware Version:** 1.1.0  
**Server Version:** 1.0.0  
**Last Updated:** May 28, 2026
