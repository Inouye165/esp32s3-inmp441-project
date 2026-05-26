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
    │   │   ├── audioIngest.ts  TCP listener, PCM→dBFS, rolling WAV files
    │   │   └── esp32Service.ts Typed fetch helpers for /api/info
    │   └── types/index.ts      Shared TypeScript interfaces
    ├── public/                 Minimal web dashboard (HTML + Chart.js)
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

```bash
cd server
# server/.env.local  (gitignored)
# ESP32_IP=10.0.0.x
# ESP32_PORT=80
# STREAM_INGEST_ENABLED=true

npm run dev
```

Open **http://localhost:3000**. The ingest listener starts automatically.
Click **Start listener** if it hasn't auto-started, then watch the waveform fill in.

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

## Desktop Server API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server uptime + ingest status |
| GET | `/api/config` | Current ESP32 IP/port |
| POST | `/api/config` | Set ESP32 IP/port (`{ "ip": "x.x.x.x", "port": 80 }`) |
| GET | `/api/proxy/info` | Proxied board info (120 s stale cache on failure) |
| GET | `/api/stream/status` | Ingest listener status |
| POST | `/api/stream/listener` | Start/stop listener (`{ "enabled": true }`) |
| GET | `/api/stream/live-samples` | SSE stream of dBFS samples (drives waveform) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Firmware | C++ · Arduino / ESP-IDF · FreeRTOS |
| Audio driver | ESP32 I²S legacy driver (`driver/i2s.h`) |
| HTTP server (device) | ESP32 `WebServer` · ArduinoJson |
| Stream transport | Raw TCP, int16 LE PCM, 8-byte preamble |
| Desktop server | TypeScript · Express 4 · Node 20+ |
| Ingest service | `net.Server` TCP listener, rolling WAV files |
| Live waveform | SSE (`text/event-stream`) → Chart.js |
| Testing | Jest · ts-jest · Supertest |
| Dashboard | Bootstrap 5 · Chart.js 4 · Vanilla JS |
