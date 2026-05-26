/**
 * ESP32-S3 INMP441 Microphone — Streaming-only Entry Point
 *
 * The device is a thin TCP audio source. All analysis, recording, and UI
 * live on the desktop/server side.
 *
 * Architecture:
 *   - audioStreamTask (Core 0): the SOLE owner of I2S. Reads DMA buffers
 *       and streams raw int16 PCM over TCP, auto-reconnecting forever.
 *   - loop() (Core 1): runs a tiny HTTP server with /api/info + /api/health.
 *
 * HTTP (port 80):
 *   GET /            → 200 OK plain text
 *   GET /api/info    → board + mic + stream metadata (JSON)
 *   GET /api/health  → liveness / uptime / streaming flag (JSON)
 */

#include <Arduino.h>
#include <WebServer.h>

#include "config.h"
#include "wifi_manager.h"
#include "i2s_microphone.h"
#include "http_api.h"
#include "audio_stream.h"

// ─── Globals ─────────────────────────────────────────────────────────────────

static WebServer g_server(HTTP_PORT);

// ─── Arduino setup ───────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(500);   // let the serial monitor open
    Serial.println("\n=== ESP32-S3 INMP441 Streamer ===");
    Serial.printf("Firmware v%s  Board: %s\n\n", FIRMWARE_VERSION, BOARD_NAME);

    // 1. Connect to WiFi
    if (!wifiConnect()) {
        Serial.println("[FATAL] WiFi connection failed. Restarting in 5 s…");
        delay(5000);
        ESP.restart();
    }

    // 2. Initialise I2S microphone (at STREAM_SAMPLE_RATE)
    if (!micInit()) {
        Serial.println("[FATAL] I2S microphone init failed. Restarting in 5 s…");
        delay(5000);
        ESP.restart();
    }

    // 3. Register routes and start HTTP server
    httpApiBegin(g_server);

    // 4. Start TCP streaming task (no-op if STREAM_HOST is unset/empty).
    //    This task is the sole owner of I2S — no other task touches the bus.
    audioStreamBegin();

    Serial.println("\n[OK] System ready.\n");
}

// ─── Arduino loop ────────────────────────────────────────────────────────────

void loop() {
    httpApiHandle(g_server);
    // Yield so the WiFi stack and other tasks get CPU time
    delay(1);
}
