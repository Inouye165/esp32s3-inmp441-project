/**
 * Classic ESP32 (ESP32-D0WD-V3) INMP441 Audio Streamer
 *
 * Architecture:
 *   Core 0: audioStreamTask — sole I2S owner, streams raw int16 PCM over TCP.
 *   Core 1: loop() — HTTP server (/api/info, /api/health).
 *
 * Boot sequence:
 *   1. Print chip model, board, I2S pins
 *   2. Blink built-in LED 5 times (GPIO 2)
 *   3. Connect WiFi
 *   4. Init I2S (GPIO 26/25/34)
 *   5. Start HTTP server
 *   6. Start TCP streaming task → server:8002
 */

#include <Arduino.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_chip_info.h>

#include "config_esp32.h"
#include "wifi_manager.h"
#include "i2s_mic.h"
#include "http_api.h"
#include "audio_stream.h"

// Built-in LED is GPIO 2 on most ESP32 DevKit V1 boards.
#ifndef LED_BUILTIN
  #define LED_BUILTIN 2
#endif

static WebServer g_server(HTTP_PORT);

static void blinkLed(int times, int onMs = 150, int offMs = 150) {
    pinMode(LED_BUILTIN, OUTPUT);
    for (int i = 0; i < times; ++i) {
        digitalWrite(LED_BUILTIN, HIGH);
        delay(onMs);
        digitalWrite(LED_BUILTIN, LOW);
        delay(offMs);
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);

    // ── Banner ────────────────────────────────────────────────────────────────
    Serial.println("\n============================================");
    Serial.println("  Classic ESP32 INMP441 Audio Streamer");
    Serial.printf ("  Firmware : v%s\n", FIRMWARE_VERSION);
    Serial.printf ("  Board    : %s\n",  BOARD_NAME);

    // Print chip model at boot for easy verification
    esp_chip_info_t chip;
    esp_chip_info(&chip);
    const char* chipStr = "ESP32 (unknown)";
    if (chip.model == CHIP_ESP32)   chipStr = "ESP32";
    if (chip.model == CHIP_ESP32S3) chipStr = "ESP32-S3  <-- WRONG UNIT!";
    Serial.printf ("  Chip     : %s  rev%d  %d cores\n",
                   chipStr, chip.revision, chip.cores);

    Serial.println("  I2S pins : SCK=26  WS=25  SD=34  L/R=GND");
    Serial.printf ("  Stream   : %s:%d (TCP raw PCM, 16 kHz)\n",
                   STREAM_HOST, STREAM_PORT);
    Serial.println("============================================\n");

    // ── LED startup blink: 5 flashes ─────────────────────────────────────────
    Serial.println("[Boot] LED blink x5 …");
    blinkLed(5);
    Serial.println("[Boot] Blink done.");

    // ── WiFi ─────────────────────────────────────────────────────────────────
    if (!wifiConnect()) {
        Serial.println("[FATAL] WiFi failed. Restarting in 5 s…");
        delay(5000);
        ESP.restart();
    }
    Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] Stream endpoint: tcp://%s:%d\n",
                  STREAM_HOST, STREAM_PORT);

    // ── I2S microphone ───────────────────────────────────────────────────────
    if (!micInit()) {
        Serial.println("[FATAL] I2S init failed. Restarting in 5 s…");
        delay(5000);
        ESP.restart();
    }

    // ── HTTP API ─────────────────────────────────────────────────────────────
    httpApiBegin(g_server);

    // ── TCP streaming task (Core 0) ──────────────────────────────────────────
    audioStreamBegin();

    Serial.println("\n[OK] System ready — streaming to server.\n");
}

void loop() {
    httpApiHandle(g_server);
    delay(1);
}
