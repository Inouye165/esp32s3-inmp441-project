# ESP32-S3 · INMP441 Audio Monitor

Real-time audio level dashboard for the ESP32-S3 + INMP441 I²S microphone.

```
┌─────────────┐   I²S    ┌──────────┐   WiFi    ┌─────────────────┐   HTTP
│   INMP441   │ ────────▶│ ESP32-S3 │ ─────────▶│  Desktop Server │◀──────── Browser
│  Microphone │          │ REST API │           │  (TypeScript)   │
└─────────────┘          └──────────┘           └─────────────────┘
```

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

## Setup History And Issues

This project started with a misleading hardware assumption: the repository name
and initial wiring notes said "ESP32-S3", but the board that was physically
connected at first was a **classic ESP32 (ESP32-D0WD-V3)**. That mattered.

- The original attached board was not an S3. We confirmed that from the upload
    logs, which identified it as `ESP32-D0WD-V3` with 4 MB flash.
- The working board is now an **ESP32-S3-WROOM-1 (16 MB flash / 8 MB PSRAM)**.
- The classic ESP32 build produced WiFi connectivity and HTTP responses, but it
    never gave reliable microphone data for this wiring/layout.
- Once the hardware actually matched the intended S3 target, the same project
    started behaving normally.

Main failure modes we hit during bring-up:

- **Wrong board assumption**: firmware and docs were written as if an S3 was
    connected, while the attached hardware was an older ESP32.
- **Unsafe / stale I2S pin choices**: the older board had already been moved
    around to work around pin conflicts. On the final S3 setup we standardized on
    GPIO 4 / 5 / 6 for BCLK / LRCLK / DOUT.
- **Very quiet recordings**: the old recorder used fixed-gain live streaming.
    Quiet takes stayed quiet because the firmware could not see the final peak of
    the whole recording. The current S3 firmware buffers the take in PSRAM and
    normalizes it before returning the WAV.
- **Waveform pause during recording**: expected with the current legacy I2S
    driver. The recording path takes exclusive ownership of I2S, so the live
    level display pauses or flatlines while a recording is in progress.

If audio works on an ESP32-S3-WROOM-1 but not on a plain ESP32 dev board, trust
the hardware result. In this project, that difference was real rather than a
software illusion.

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
pio run --target upload          # flashes COM6 on the current ESP32-S3 setup
pio device monitor               # watch serial output for the ESP32's IP
```

### 2 — Start the desktop server

```bash
cd server
cp .env.local.example .env.local
# edit .env.local and set ESP32_IP=<the IP shown in serial monitor>
npm run dev
```

Open **http://localhost:3000** in your browser.

You can also set the ESP32 IP from the dashboard UI without restarting the server.
Server-side machine-local settings belong in `server/.env.local`, which is not committed.

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
