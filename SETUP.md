# ESP32-S3 INMP441 Audio Streamer — Complete Setup Guide

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Hardware Requirements](#hardware-requirements)
- [Wiring Guide](#wiring-guide)
- [Software Requirements](#software-requirements)
- [Initial Setup from Scratch](#initial-setup-from-scratch)
- [Starting the Application](#starting-the-application)
- [How It Works](#how-it-works)
- [Features](#features)
- [API Reference](#api-reference)
- [Known Issues & Limitations](#known-issues--limitations)
- [Improvement Opportunities](#improvement-opportunities)

---

## Project Overview

This is a **real-time audio streaming system** that turns an ESP32-S3 microcontroller with an INMP441 I²S MEMS microphone into a network audio source. The ESP32 acts as a "dumb streamer" — it reads raw PCM audio samples over the I²S bus and pushes them to a desktop server over TCP. All recording, waveform visualization, dBFS computation, and analysis happen on the server.

**Architecture:**
```
┌─────────────┐   I²S    ┌──────────┐  TCP raw PCM  ┌─────────────────┐   SSE/HTTP
│   INMP441   │ ────────▶│ ESP32-S3 │ ─────────────▶│  Desktop Server │◀────────── Browser
│  Microphone │          │ Streamer │  16 kHz int16  │  (Node/TypeScript)│
└─────────────┘          └──────────┘                └─────────────────┘
```

**Why this design?**
- ESP32 stays simple and focused on real-time I²S streaming
- Server has more memory/CPU for DSP, storage, and rich UI
- Network-based architecture allows multiple ESP32 units to stream to one server
- Hot-reload development without reflashing firmware

---

## Hardware Requirements

### Required Components

1. **ESP32-S3-WROOM-1** (N16R8 variant recommended)
   - 16 MB flash + 8 MB octal PSRAM
   - USB-C for programming and serial monitor
   - Alternative: ESP32-S3-DevKitC-1 or compatible

2. **INMP441 I²S MEMS Microphone**
   - Digital output (I²S protocol)
   - 3.3V supply (⚠️ **DO NOT use 5V**)
   - 6-pin breakout board

3. **USB-C Cable** (for programming)

4. **Jumper Wires** (6 wires minimum)

### Optional Components

- **Classic ESP32** (ESP32-D0WD DevKit V1) — supported as "Unit 2" for multi-source streaming
- LED indicators (if desired for visual feedback)

---

## Wiring Guide

### ESP32-S3 ↔ INMP441 Pin Connections

| INMP441 Pin | ESP32-S3 GPIO | Wire Color (suggested) | Description |
|-------------|---------------|------------------------|-------------|
| **VDD**     | **3V3**       | 🟥 Red                 | Power supply (⚠️ 3.3V ONLY) |
| **GND**     | **GND**       | ⬛ Black              | Ground |
| **L/R**     | **GND**       | 🟩 Green              | Channel select (GND = LEFT) |
| **SCK**     | **GPIO 4**    | 🟧 Orange             | Bit clock (I²S_SCK) |
| **WS**      | **GPIO 5**    | 🟨 Yellow             | Word select (I²S_WS) |
| **SD**      | **GPIO 6**    | 🟫 Brown              | Serial data out (I²S_SD) |

### Pin Selection Rationale

GPIOs 4, 5, and 6 were chosen because they:
- Are physically grouped on one side of the WROOM-1 module
- Avoid all reserved functions on ESP32-S3:
  - Not strapping pins (0, 3, 45, 46)
  - Not octal flash/PSRAM (26–37, internal only)
  - Not native USB (19, 20)
  - Not UART0 monitor (43, 44)

**Alternative pins:** GPIOs 7–18 are equally safe. Avoid 19/20 (USB), 26–37 (flash/PSRAM), 43/44 (UART), 45/46 (strapping).

### Classic ESP32 Wiring (Unit 2, Optional)

If using a second ESP32 (classic ESP32-D0WD):

| INMP441 Pin | ESP32 Classic GPIO | Notes |
|-------------|--------------------|-------|
| SCK         | GPIO 26            | Bit clock |
| WS          | GPIO 25            | Word select |
| SD          | **GPIO 33**        | ⚠️ NOT GPIO 32 (conflicts with 32 kHz crystal) |
| L/R         | GND                | LEFT channel |
| VDD         | 3.3V               | |
| GND         | GND                | |

---

## Software Requirements

### Development Machine

1. **Node.js** (v18 or later)
   - Download: https://nodejs.org/
   - Verify: `node --version` and `npm --version`

2. **PlatformIO CLI** (for ESP32 firmware)
   - Install via VS Code extension: `platformio.platformio-ide`
   - Or standalone: https://platformio.org/install/cli
   - Verify: `pio --version`

3. **Git** (for version control)

4. **Code Editor** (VS Code recommended)
   - Extensions: PlatformIO IDE, ESLint, TypeScript

### ESP32 Firmware

- Platform: `espressif32` (Arduino framework)
- Libraries:
  - `bblanchon/ArduinoJson@^7.0.0` (auto-installed by PlatformIO)
  - Built-in: `WiFi.h`, `WebServer.h`, `driver/i2s.h`

### Server

- Runtime: Node.js with TypeScript
- Key dependencies:
  - `express` — HTTP server
  - `cors` — Cross-origin support
  - `multer` — File uploads (module images)
  - `dotenv` — Environment variables
- Dev dependencies:
  - `ts-node-dev` — Hot-reload during development
  - `jest` + `supertest` — Testing

---

## Initial Setup from Scratch

### 1. Clone the Repository

```bash
git clone <repository-url>
cd esp32s3-inmp441-project
```

### 2. Configure ESP32 Firmware

#### a. Create Secrets File

```bash
cd firmware
cp include/secrets.h.example include/secrets.h
```

Edit `include/secrets.h`:

```cpp
#define WIFI_SSID     "YourWiFiNetwork"
#define WIFI_PASSWORD "YourPassword"
#define STREAM_HOST   "192.168.1.100"  // Your desktop's local IP
```

**Finding your desktop IP:**
- Windows: `ipconfig` (look for IPv4 Address)
- macOS/Linux: `ifconfig` or `ip addr`

#### b. Compile and Upload Firmware

Connect ESP32-S3 via USB, then:

```bash
# Auto-detect port and upload
pio run --target upload

# View serial output (optional but helpful)
pio device monitor
# Press Ctrl+C to exit monitor
```

**Troubleshooting:**
- If upload fails with "Permission denied": Close any serial monitor first
- If "Port not found": Check Device Manager (Windows) or `ls /dev/tty*` (Unix)
- If stuck at "Connecting...": Hold BOOT button on ESP32 during upload

### 3. Configure Server

#### a. Install Dependencies

```bash
cd ../server
npm install
```

#### b. Create Environment File (Optional)

Create `server/.env` (or `.env.local` to override):

```bash
# Server HTTP port
PORT=3000

# TCP audio streaming ports
STREAM_INGEST_ENABLED=true
STREAM_INGEST_PORT=8001

STREAM_INGEST2_ENABLED=true
STREAM_INGEST2_PORT=8002

# Archive settings
RECORDINGS_DIR=./recordings
ARCHIVE_CHUNK_MS=2000
ARCHIVE_AUTO_START=false

# ESP32 IP (optional, can be set via UI)
ESP32_IP=
ESP32_PORT=80
```

**Note:** Defaults work fine for most cases. The `.env` file is optional.

#### c. Create Required Directories

```bash
# Recordings storage
mkdir -p recordings/stream

# Module uploads
mkdir -p public/uploads

# Module registry data
mkdir -p data
```

---

## Starting the Application

### 1. Start the Server

```bash
cd server
npm run dev
```

You should see:

```
[Ingest] listening for PCM stream on TCP :8001
[Ingest2] Listening for classic ESP32 PCM stream on TCP :8002

 ESP32 INMP441 Streamer Dashboard
 Server:     http://localhost:3000
 Unit 1 IP:  (set via POST /api/config)
 Ingest 1:   TCP :8001
 Ingest 2:   TCP :8002
```

### 2. Power On ESP32

- Connect ESP32 to USB power or external 5V supply
- Wait 5–10 seconds for WiFi connection
- Serial monitor should show:

```
=== ESP32-S3 INMP441 Streamer ===
Firmware v1.1.0  Board: ESP32-S3-WROOM-1 (N16R8)

[WiFi] Connecting to YourNetwork...
[WiFi] Connected! IP: 192.168.1.50
[I2S] Init OK (16000 Hz, 16-bit, mono)
[Stream] Connecting to 192.168.1.100:8001...
[Stream] Connected! Starting audio...
[OK] System ready.
```

### 3. Open Web Dashboard

Navigate to: **http://localhost:3000**

You should see:
- Real-time waveform (dBFS level graph)
- Module cards (ESP32 units)
- Network status indicator
- Playback controls

---

## How It Works

### Streaming Protocol

1. **ESP32 establishes TCP connection** to server on port 8001 (or 8002 for Unit 2)
2. **Sends 8-byte preamble:**
   - `PCM1` magic (4 bytes, little-endian uint32: `0x314D4350`)
   - Sample rate (4 bytes, little-endian uint32: `16000`)
3. **Streams continuous int16 PCM samples** (little-endian, mono)
   - Sample rate: 16 kHz
   - Bit depth: 16-bit
   - Channels: Mono (LEFT channel)
   - Gain: 32× (applied on ESP32 before transmission)

### Server Audio Ingest (`audioIngest.ts`)

The ingest service performs three tasks simultaneously:

1. **Rolling WAV files** — Appends PCM data to hourly WAV files (`recordings/stream/YYYY-MM-DD_HH-00-00.wav`)
   - Allows HTTP Range requests for playback
   - Auto-creates new file each hour
   - Zero-fills gaps if ESP32 disconnects briefly (<30s)

2. **dBFS calculation** — Computes RMS level every 200 ms window
   - Formula: `20 * log10(rms / 32768)`
   - Emits `dbfs-sample` events for live waveform

3. **In-memory ring buffer** — Keeps last ~4 minutes of dBFS samples
   - Fast queries for recent waveform history
   - No disk I/O for live view

### Firmware Architecture

**Two independent cores on ESP32:**

- **Core 0** — `audioStreamTask()` (FreeRTOS task)
  - Sole owner of I2S peripheral
  - Reads 32-bit I2S samples from DMA buffers
  - Converts 24→16 bit with 32× gain
  - Streams int16 PCM over TCP socket
  - Auto-reconnects on failure (exponential backoff)

- **Core 1** — `loop()` (Arduino main loop)
  - Runs lightweight HTTP server (port 80)
  - Endpoints:
    - `GET /` — Plain text OK
    - `GET /api/info` — Board metadata (JSON)
    - `GET /api/health` — Uptime + streaming status

### Module Registry

The server maintains a persistent registry of ESP32 modules (`data/modules.json`):

```json
[
  {
    "id": "esp32s3",
    "name": "ESP32-S3 Unit 1",
    "type": "ESP32-S3-WROOM-1",
    "ip": "192.168.1.50",
    "port": 80,
    "hasLed": false,
    "imageFile": "esp32s3.jpg"
  }
]
```

Modules can be:
- Added/removed via `/api/modules` endpoint
- Updated with photos (uploaded to `public/uploads/`)
- Queried for board info via proxy (`/api/proxy/:id/info`)

---

## Features

### Current Capabilities

✅ **Real-time audio streaming** (TCP, 16 kHz mono PCM)  
✅ **Live waveform visualization** (Server-Sent Events)  
✅ **Hourly WAV file recording** with HTTP Range playback  
✅ **Multi-unit support** (2 ESP32s simultaneously)  
✅ **Module registry** with photos and metadata  
✅ **Network health check** (WiFi SSID validation)  
✅ **Auto-reconnect** (ESP32 → server)  
✅ **Zero-fill gap handling** (maintains time alignment)  
✅ **Tabbed web UI** (Dashboard, Modules, Playback)  
✅ **RESTful API** with JSON responses  
✅ **Jest test suite** (unit + integration)  

### Not Yet Implemented

⚠️ Audio analysis (FFT, spectrograms)  
⚠️ Voice activity detection (VAD)  
⚠️ Cloud storage integration  
⚠️ WebSocket alternative to SSE  
⚠️ Authentication/authorization  
⚠️ HTTPS/TLS encryption  

---

## API Reference

### Server Endpoints

#### Health & Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server uptime + ingest status |
| `GET` | `/api/config` | Current ESP32 IP/port config |
| `POST` | `/api/config` | Update ESP32 IP/port |
| `GET` | `/api/network/check` | Verify WiFi network (security check) |

#### Audio Ingest

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ingest/status` | Connection status, sample rate, bytes received |
| `GET` | `/api/ingest/dbfs` | Recent dBFS samples (last ~4 min) |
| `GET` | `/api/ingest/stream` | **SSE stream** of live dBFS samples |
| `GET` | `/api/ingest/hours` | List of recorded hour files |
| `GET` | `/api/ingest/hours/:timestamp` | Serve specific hour WAV (supports Range) |

#### Module Registry

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/modules` | List all registered modules |
| `POST` | `/api/modules` | Add new module |
| `GET` | `/api/modules/:id` | Get module by ID |
| `PATCH` | `/api/modules/:id` | Update module metadata |
| `DELETE` | `/api/modules/:id` | Remove module |
| `POST` | `/api/modules/:id/upload` | Upload module photo |
| `GET` | `/api/proxy/:id/info` | Fetch `/api/info` from module's HTTP server |

#### Legacy Endpoints (Chunk Recording)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/archive/status` | Chunk poller status (deprecated) |
| `POST` | `/api/archive/start` | Start chunk poller |
| `POST` | `/api/archive/stop` | Stop chunk poller |

### ESP32 Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Plain text "OK" |
| `GET` | `/api/info` | Board name, firmware version, mic type, streaming status |
| `GET` | `/api/health` | Uptime, WiFi status, streaming connection flag |

---

## Known Issues & Limitations

### ⚠️ Not Best Practices

1. **No Authentication**
   - Server API is wide open (LAN-only deployment assumed)
   - No API keys, no user accounts
   - SSRF protection is minimal (IP whitelist only)

2. **Plain HTTP** (no TLS)
   - Traffic is unencrypted
   - Suitable for trusted LANs only

3. **Hardcoded Secrets in Firmware**
   - WiFi credentials in `secrets.h` compiled into binary
   - Should use WiFi provisioning (e.g., Captive Portal, BLE)

4. **No Database**
   - Module registry stored in flat JSON file
   - No transactional integrity
   - Concurrent writes could corrupt data

5. **Minimal Error Handling**
   - Server crashes could orphan TCP sockets
   - No graceful shutdown handlers
   - WAV headers not flushed on process kill

6. **Fixed Sample Rate**
   - 16 kHz hardcoded (firmware + server must match)
   - No negotiation or fallback

7. **Single-Threaded Server**
   - Node.js event loop can block on heavy I/O
   - Large file reads could stall SSE streams

8. **No Rate Limiting**
   - API endpoints can be spammed
   - DoS risk in hostile environments

9. **TypeScript `any` types**
   - Some service interfaces use loose typing
   - Should be strictly typed for safety

10. **Test Coverage**
    - Not all edge cases covered
    - No integration tests for TCP streaming

### 🐛 Known Bugs

- **Hour file gaps:** If ESP32 disconnects for >30s, server creates new hour file instead of resuming
- **SSE reconnect:** Browser SSE reconnects don't always sync with latest dBFS index
- **Module upload:** Deleting a module doesn't clean up its uploaded image

### 🔒 Security Concerns

- **Path Traversal:** `modules.json` ID could be exploited (e.g., `../../etc/passwd`)
  - Mitigation: Validate IDs against `[a-z0-9_-]+` pattern

- **SSRF via IP Config:** `/api/config` allows setting ESP32 IP
  - Mitigation: `isPrivateIp()` check, but should also rate-limit

- **File Upload:** Multer checks extensions but not MIME types deeply
  - Risk: Malicious files disguised as images

---

## Improvement Opportunities

### 🚀 High Priority

1. **Add Authentication**
   - JWT tokens or session-based auth
   - Protect `/api/modules`, `/api/config` endpoints
   - Read-only public dashboard, admin panel for config

2. **WiFi Provisioning**
   - BLE or SoftAP captive portal for first-time setup
   - Store credentials in NVS (non-volatile storage)
   - QR code configuration

3. **Database Migration**
   - SQLite for module registry (lightweight, file-based)
   - Prisma ORM for type-safe queries
   - Schema migrations

4. **HTTPS Support**
   - Self-signed certificates for local dev
   - Let's Encrypt for public deployments
   - `express-https-redirect` middleware

5. **Graceful Shutdown**
   - `SIGINT`/`SIGTERM` handlers
   - Flush WAV headers on exit
   - Close TCP sockets cleanly

6. **Error Recovery**
   - Server should survive ESP32 crashes
   - Circuit breaker for failing module queries
   - Exponential backoff for ESP32 HTTP requests

### 🎨 Nice to Have

7. **Audio Analysis Features**
   - FFT/spectrogram display (Web Audio API or server-side)
   - Voice activity detection (VAD)
   - Silence trimming on WAV files

8. **WebSocket Alternative**
   - Replace SSE with Socket.IO for bidirectional comms
   - Server can push alerts to clients
   - Lower latency than SSE

9. **Mobile App**
   - React Native or Flutter
   - Push notifications for audio events
   - Remote monitoring

10. **Cloud Storage**
    - Upload hourly WAVs to S3/Azure Blob
    - Automatic cleanup of old local files
    - Streaming playback from cloud

11. **Multi-Room Support**
    - Tag modules by room/location
    - Synchronized playback
    - Aggregate waveforms (multiple mics)

12. **Config UI**
    - Web-based firmware config (no reflashing)
    - Sample rate selection
    - Gain adjustment via API

13. **Docker Deployment**
    - `Dockerfile` + `docker-compose.yml`
    - One-command server startup
    - Volume mounts for recordings

14. **CI/CD Pipeline**
    - GitHub Actions for tests
    - Automated PlatformIO builds
    - Release artifacts (firmware.bin)

15. **Logging & Metrics**
    - Winston or Pino for structured logs
    - Prometheus metrics endpoint
    - Grafana dashboard

### 🧪 Developer Experience

16. **TypeScript Strictness**
    - Enable `strict: true` in `tsconfig.json`
    - Remove all `any` types
    - Enforce ESLint rules

17. **Integration Tests**
    - Mock TCP clients for ingest tests
    - Supertest for full API coverage
    - GitHub Actions test runner

18. **Documentation**
    - OpenAPI/Swagger spec for REST API
    - JSDoc comments for all services
    - Architecture decision records (ADRs)

19. **Hot Module Replacement**
    - Frontend dev server with HMR
    - Vite or Webpack Dev Server
    - Separate client build pipeline

---

## Frequently Asked Questions

### Q: Can I use a different ESP32 board?

**A:** Yes! The code works on any ESP32 with I²S support:
- ESP32-S2, ESP32-C3, ESP32-C6 (adjust I²S API for newer IDF versions)
- Classic ESP32 (tested on ESP32-D0WD DevKit V1)
- Adjust GPIO pins in `config.h` to match your board's capabilities

### Q: Can I use a different microphone?

**A:** Yes, any I²S microphone works:
- SPH0645 (Adafruit)
- ICS-43434
- MAX9814 (analog → I²S via ADC)
- Adjust `I2S_BITS` in `config.h` if mic outputs non-24-bit data

### Q: Why 16 kHz sample rate?

**A:** Balance between:
- Audio quality (good for voice/speech)
- WiFi bandwidth (256 kbps = very stable)
- Server I/O overhead

To change: Edit `STREAM_SAMPLE_RATE` in `firmware/include/config.h` and reflash. Server auto-detects from preamble.

### Q: Can I run the server on a Raspberry Pi?

**A:** Yes! The server is pure Node.js:
```bash
# On Raspberry Pi
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
cd server && npm install && npm run dev
```

Update `STREAM_HOST` in ESP32's `secrets.h` to the Pi's IP.

### Q: How do I stop the server?

**A:** Press `Ctrl+C` in the terminal. To kill forcefully:

**Windows:**
```powershell
netstat -ano | findstr :3000    # Find PID
taskkill /PID <PID> /F          # Replace <PID>
```

**Linux/macOS:**
```bash
lsof -ti:3000 | xargs kill -9
```

### Q: Why are recordings split by hour?

**A:** Benefits:
- Manageable file sizes (16 kHz × 2 bytes × 3600s ≈ 112 MB/hour)
- Easy to archive/delete old files
- HTTP Range requests work without complex stitching
- Filesystem handles thousands of small files better than few giant files

---

## Troubleshooting

### ESP32 won't connect to WiFi

1. Check SSID/password in `secrets.h`
2. Verify 2.4 GHz network (ESP32 doesn't support 5 GHz)
3. Check router firewall (some block new devices)
4. Try fixed IP in `secrets.h`:
   ```cpp
   IPAddress local_IP(192, 168, 1, 50);
   IPAddress gateway(192, 168, 1, 1);
   IPAddress subnet(255, 255, 255, 0);
   WiFi.config(local_IP, gateway, subnet);
   ```

### Server shows "Connection refused"

1. Firewall blocking port 8001/8002:
   ```powershell
   # Windows: Allow inbound TCP
   New-NetFirewallRule -DisplayName "ESP32 Audio" -Direction Inbound -Protocol TCP -LocalPort 8001,8002 -Action Allow
   ```

2. Wrong `STREAM_HOST` in ESP32's `secrets.h` — must match server's LAN IP

3. Server not running — check `npm run dev` is active

### No audio waveform in browser

1. Check `/api/ingest/status` — should show `connected: true`
2. Open DevTools → Network → look for `stream` SSE connection
3. Try different browser (Chrome/Edge handle SSE best)
4. Check ESP32 serial monitor for "[Stream] Connected!" message

### Choppy audio playback

1. Low WiFi signal → move ESP32 closer to router
2. Server CPU overload → close other apps
3. Large hour file → wait for current hour to roll over
4. Browser buffering → use VLC to play `/api/ingest/hours/:timestamp` directly

---

## Support & Contributing

- **Issues:** Report bugs or feature requests via GitHub Issues
- **Pull Requests:** Contributions welcome! Follow existing code style.
- **Discussions:** Ask questions in GitHub Discussions

---

## License

*(Add your license here — MIT, Apache 2.0, etc.)*

---

**Last Updated:** May 28, 2026  
**Firmware Version:** 1.1.0  
**Server Version:** 1.0.0
