/**
 * ESP32-S3 INMP441 Microphone — Main Entry Point
 *
 * Architecture:
 *   - micTask  (Core 1, priority 2): continuously reads I2S DMA buffers,
 *               computes RMS/dBFS, stores result in a thread-safe shared var.
 *   - loop()   (Core 1, priority 1): handles HTTP API client requests.
 *
 * REST API (served on port 80):
 *   GET /                  → health check
 *   GET /api/info          → board + microphone metadata (JSON)
 *   GET /api/audio/level   → current audio level (JSON, poll at will)
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

// ─── FreeRTOS task: continuous audio capture ─────────────────────────────────

static void micTask(void* /*pvParameters*/) {
    for (;;) {
        micReadLevel();   // blocks until DMA buffer is ready, then updates shared state
        // No explicit delay — the I2S DMA read naturally paces the task
    }
}

// ─── Arduino setup ───────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(500);   // let the serial monitor open
    Serial.println("\n=== ESP32-S3 INMP441 Audio API ===");
    Serial.printf("Firmware v%s  Board: %s\n\n", FIRMWARE_VERSION, BOARD_NAME);

    // 1. Connect to WiFi
    if (!wifiConnect()) {
        Serial.println("[FATAL] WiFi connection failed. Restarting in 5 s…");
        delay(5000);
        ESP.restart();
    }

    // 2. Initialise I2S microphone
    if (!micInit()) {
        Serial.println("[FATAL] I2S microphone init failed. Restarting in 5 s…");
        delay(5000);
        ESP.restart();
    }

    // 3. Start dedicated audio capture task on Core 0
    //    (leaves Core 1 free for the HTTP + Arduino loop)
    xTaskCreatePinnedToCore(
        micTask,
        "micTask",
        4096,    // stack size (bytes)
        nullptr,
        2,       // priority (higher than loop)
        nullptr,
        0        // pin to Core 0
    );

    // 4. Register routes and start HTTP server
    httpApiBegin(g_server);

    // 5. Start Phase 6 TCP streaming task (no-op if STREAM_HOST is unset/empty)
    audioStreamBegin();

    Serial.println("\n[OK] System ready.\n");
}

// ─── Arduino loop ────────────────────────────────────────────────────────────

void loop() {
    httpApiHandle(g_server);
    // Yield so the WiFi stack and other tasks get CPU time
    delay(1);
}
