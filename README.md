# ESP32-S3 · INMP441 Audio Monitor

Real-time audio level dashboard for the ESP32-S3 + INMP441 I²S microphone.

```
┌─────────────┐   I²S    ┌──────────┐   WiFi    ┌─────────────────┐   HTTP
│   INMP441   │ ────────▶│ ESP32-S3 │ ─────────▶│  Desktop Server │◀──────── Browser
│  Microphone │          │ REST API │           │  (TypeScript)   │
└─────────────┘          └──────────┘           └─────────────────┘
```

## Wiring

| INMP441 | ESP32-S3 GPIO | Notes |
|---------|--------------|-------|
| VDD     | 3.3 V        | **Do not use 5 V** |
| GND     | GND          | |
| L/R     | GND          | Selects Left channel |
| SCK     | GPIO 14      | Bit clock (BCLK) |
| WS      | GPIO 15      | Word select (LRCLK) |
| SD      | GPIO 32      | Serial data out |

> **Note:** On ESP32-S3 boards with Octal flash/PSRAM (N8R8 variants), GPIO 32 may be
> reserved. If you see I²S read errors, move SD to GPIO 38/39/40 and update
> `firmware/include/config.h`.

## Project Structure

```
├── firmware/          # PlatformIO / Arduino — ESP32 REST API
│   ├── include/config.h        WiFi credentials, pin definitions
│   └── src/
│       ├── main.cpp            Setup + FreeRTOS task orchestration
│       ├── wifi_manager.*      WiFi connection helper
│       ├── i2s_microphone.*    I²S driver + RMS/dBFS computation
│       └── http_api.*          Express-style route handlers (WebServer)
│
└── server/            # TypeScript / Express — dashboard + proxy
    ├── src/
    │   ├── server.ts           Entry point
    │   ├── app.ts              Express app factory
    │   ├── config.ts           Runtime + env config
    │   ├── routes/api.ts       /api/config, /api/proxy/*
    │   ├── services/esp32Service.ts  Typed fetch + pure parse helpers
    │   └── types/index.ts      Shared TypeScript interfaces
    ├── public/                 Static web dashboard (HTML + Chart.js)
    └── tests/                  Jest unit tests (19 tests)
```

## Quick Start

### 1 — Flash the ESP32

```bash
cd firmware
pio run --target upload          # flashes COM4 (adjust in platformio.ini)
pio device monitor               # watch serial output for the ESP32's IP
```

### 2 — Start the desktop server

```bash
cd server
cp .env.example .env
# edit .env and set ESP32_IP=<the IP shown in serial monitor>
npm run dev
```

Open **http://localhost:3000** in your browser.

You can also set the ESP32 IP from the dashboard UI without restarting the server.

### 3 — Tests

```bash
cd server
npm test               # run all unit tests
npm run test:coverage  # with coverage report
```

## ESP32 REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/api/info` | Board + microphone metadata (JSON) |
| GET | `/api/audio/level` | Current dBFS level (JSON, poll freely) |

All responses include `Access-Control-Allow-Origin: *` headers.

## Desktop Server API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Current ESP32 IP/port |
| POST | `/api/config` | Set ESP32 IP (`{ "ip": "x.x.x.x" }`) |
| GET | `/api/proxy/info` | Proxied board info |
| GET | `/api/proxy/audio/level` | Proxied audio level |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Firmware | C++ · Arduino / ESP-IDF · FreeRTOS |
| Audio driver | ESP32 I²S legacy driver (`driver/i2s.h`) |
| HTTP server (device) | ESP32 `WebServer` · ArduinoJson |
| Desktop server | TypeScript · Express 4 · Node 18+ |
| Testing | Jest · ts-jest · Supertest |
| Dashboard | Bootstrap 5 · Chart.js 4 · Vanilla JS |
