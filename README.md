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
├── firmware/          # PlatformIO / Arduino — ESP32 streaming firmware
│   ├── include/
│   │   ├── config.h            Pin definitions, I²S settings, stream config
│   │   └── secrets.h           WiFi credentials + STREAM_HOST (gitignored)
│   └── src/
│       ├── main.cpp            setup(): WiFi → micInit → HTTP → stream task
│       ├── wifi_manager.*      WiFi connection helper
│       ├── i2s_microphone.*    I²S driver + DC blocker
│       ├── audio_stream.*      TCP streaming task (sole I²S owner)
│       └── http_api.*          /api/info and /api/health only
│
└── server/            # TypeScript / Express — dashboard + ingest
    ├── src/
    │   ├── server.ts           Entry point
    │   ├── app.ts              Express app factory
    │   ├── config.ts           Runtime + env config
    │   ├── routes/api.ts       REST + SSE endpoints
    │   ├── services/
    │   │   ├── audioIngest.ts      TCP listener, PCM→dBFS, rolling WAV files
    │   │   ├── esp32Service.ts     Typed fetch helpers for /api/info
    │   │   └── moduleRegistry.ts   JSON-persisted module registry
    │   └── types/index.ts      Shared TypeScript interfaces
    ├── public/                 Web dashboard (tabbed UI, modules grid, modal)
    │   ├── uploads/            Module photos (served statically)
    │   ├── js/app.js           Dashboard + modules logic
    │   └── css/style.css       Dark theme + module card styles
    ├── data/                   Runtime data (gitignored)
    │   └── modules.json        Module registry persistence
    └── tests/                  Jest unit tests (20 tests)
```

## Quick Start

### 1 — Configure secrets

```bash
# firmware/include/secrets.h  (gitignored — never committed)
#define WIFI_SSID    "your-network"
#define WIFI_PASSWORD "your-password"
#define STREAM_HOST  "10.0.0.x"   # desktop IP where the server runs
```

### 2 — Flash the ESP32

```bash
cd firmware
pio run --target upload
pio device monitor               # watch serial for WiFi IP + stream connection
```

### 3 — Start the desktop server

#### Prerequisites

- **Node.js 20+** installed
- **WiFi connection** to **Dobby** or **Pumpkinpie** network (required for access)

#### Installation

```bash
cd server
npm install
```

#### Configuration

Create `server/.env.local` (gitignored) with your settings:

```bash
# Network access control (comma-separated WiFi SSIDs)
# Only allow access when connected to these networks
ALLOWED_NETWORKS=YourNetwork1,YourNetwork2

# ESP32 device IP and port (for proxy requests)
ESP32_IP=10.0.0.x
ESP32_PORT=80

# Enable audio streaming ingest
STREAM_INGEST_ENABLED=true
STREAM_INGEST_PORT=8001

# Optional: Enable Unit 2 (ESP32 Classic)
STREAM_INGEST2_ENABLED=false
STREAM_INGEST2_PORT=8002

# Server port (default: 3000)
PORT=3000
```

#### Starting the Server

**Development mode** (with hot reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled server
```

#### Accessing the Dashboard

1. Open **http://localhost:3000** in your browser
2. **Network validation** — The app checks your WiFi connection:
   - ✅ **Connected to allowed network**: Full access to dashboard
   - ❌ **Wrong/No network**: Disabled interface with "Quit" option
   - Click **Quit** → Network check page (auto-refreshes when correct network detected)
   - 🔧 **Configure allowed networks** in `server/.env.local` (see Configuration section)

3. The TCP ingest listener starts automatically on port **8001**
4. Configure ESP32 IP in the dashboard UI or use the `.env.local` settings
5. Click **Start listener** if it hasn't auto-started, then watch the waveform fill in

### 4 — Tests

```bash
cd server
npm test
```

## ESP32 REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Firmware version string |
| GET | `/api/info` | Board + microphone + stream metadata (JSON) |
| GET | `/api/health` | Uptime, RSSI, streaming flag, free heap (JSON) |

All responses include `Access-Control-Allow-Origin: *`.

## Dashboard Features

### Modules Tab

The dashboard includes a **Modules** tab for managing multiple ESP devices from a unified interface:

- **Visual card grid** — each module displays a thumbnail (upload via drag-and-drop or file picker)
- **Module registry** — JSON-persisted at `server/data/modules.json`, pre-seeded with:
  - ESP8266 NodeMCU v2 (LED control enabled)
  - ESP32-S3 Unit 1 (audio streaming)
  - ESP32 Classic Unit 2 (audio streaming)
- **Device configuration** — set IP address and port for each module
- **LED control proxy** — send ON/OFF/BLINK commands to modules with LED capability
- **Security** — LED proxy validates private IP addresses only (SSRF protection)
- **Image management** — upload board photos (≤5 MB, JPEG/PNG/GIF/WebP), served from `public/uploads/`

**Usage:** Click any module card to open the detail modal, configure IP/port, upload a photo, and control the device.

## Desktop Server API

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server uptime + ingest status |
| GET | `/api/config` | Current ESP32 IP/port |
| POST | `/api/config` | Set ESP32 IP/port (`{ "ip": "x.x.x.x", "port": 80 }`) |
| GET | `/api/proxy/info` | Proxied board info (120 s stale cache on failure) |
| GET | `/api/stream/status` | Ingest listener status |
| POST | `/api/stream/listener` | Start/stop listener (`{ "enabled": true }`) |
| GET | `/api/stream/live-samples` | SSE stream of dBFS samples (drives waveform) |

### Module Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/modules` | List all registered modules |
| PUT | `/api/modules/:id` | Update module config (`{ "ip": "x.x.x.x", "port": 80, "name": "..." }`) |
| POST | `/api/modules/:id/image` | Upload module photo (multipart form, field: `image`) |
| DELETE | `/api/modules/:id/image` | Remove module photo |
| POST | `/api/modules/:id/led/:command` | Send LED command (`on`/`off`/`blink`) to device |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Firmware | C++ · Arduino / ESP-IDF · FreeRTOS |
| Audio driver | ESP32 I²S legacy driver (`driver/i2s.h`) |
| HTTP server (device) | ESP32 `WebServer` · ArduinoJson |
| Stream transport | Raw TCP, int16 LE PCM, 8-byte preamble |
| Desktop server | TypeScript · Express 4 · Node 20+ |
| File uploads | Multer · diskStorage (image validation, 5 MB limit) |
| Ingest service | `net.Server` TCP listener, rolling WAV files |
| Live waveform | SSE (`text/event-stream`) → Chart.js |
| Testing | Jest · ts-jest · Supertest |
| Dashboard | Bootstrap 5 · Chart.js 4 · Vanilla JS (tabbed UI) |
