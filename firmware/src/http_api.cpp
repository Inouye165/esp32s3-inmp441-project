#include "http_api.h"
#include "i2s_microphone.h"
#include "config.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_chip_info.h>
#include <esp_flash.h>
#include <driver/i2s.h>

// ─── CORS helper ─────────────────────────────────────────────────────────────

static void addCorsHeaders(WebServer& server) {
    server.sendHeader("Access-Control-Allow-Origin",  "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ─── Route handlers ──────────────────────────────────────────────────────────

static void handleRoot(WebServer& server) {
    addCorsHeaders(server);
    server.send(200, "text/plain", "ESP32-S3 INMP441 Audio API v" FIRMWARE_VERSION);
}

static void handleInfo(WebServer& server) {
    addCorsHeaders(server);

    esp_chip_info_t chip;
    esp_chip_info(&chip);

    uint32_t flashSize = 0;
    esp_flash_get_size(nullptr, &flashSize);

    JsonDocument doc;
    // Map the ESP-IDF chip model enum to a human-readable string
    const char* chipModelStr;
    switch (chip.model) {
        case CHIP_ESP32:   chipModelStr = "ESP32";    break;
        case CHIP_ESP32S2: chipModelStr = "ESP32-S2"; break;
        case CHIP_ESP32S3: chipModelStr = "ESP32-S3"; break;
        case CHIP_ESP32C3: chipModelStr = "ESP32-C3"; break;
        case CHIP_ESP32C6: chipModelStr = "ESP32-C6"; break;
        case CHIP_ESP32H2: chipModelStr = "ESP32-H2"; break;
        default:           chipModelStr = "ESP32 (unknown)"; break;
    }

    doc["firmware_version"]   = FIRMWARE_VERSION;
    doc["board"]              = BOARD_NAME;
    doc["chip_model"]         = chipModelStr;
    doc["chip_revision"]      = chip.revision;
    doc["chip_cores"]         = chip.cores;
    doc["flash_size_bytes"]   = flashSize;
    doc["psram_size_bytes"]   = ESP.getPsramSize();
    doc["free_heap_bytes"]    = ESP.getFreeHeap();
    doc["sdk_version"]        = ESP.getSdkVersion();
    doc["mac"]                = WiFi.macAddress();
    doc["ip"]                 = WiFi.localIP().toString();
    doc["ssid"]               = WiFi.SSID();
    doc["rssi_dbm"]           = WiFi.RSSI();
    doc["uptime_ms"]          = millis();

    JsonObject mic = doc["microphone"].to<JsonObject>();
    mic["type"]        = MIC_TYPE;
    mic["interface"]   = "I2S";
    mic["sample_rate"] = micGetSampleRate();   // live value, not compile-time constant
    mic["bits"]        = I2S_BITS;
    mic["channel"]     = "Left (L/R=GND)";

    JsonObject pins = mic["pins"].to<JsonObject>();
    pins["sck"] = I2S_SCK_PIN;
    pins["ws"]  = I2S_WS_PIN;
    pins["sd"]  = I2S_SD_PIN;
    pins["lr"]  = "GND";
    pins["vdd"] = "3.3V";

    String body;
    serializeJson(doc, body);
    server.send(200, "application/json", body);
}

static void handleAudioLevel(WebServer& server) {
    addCorsHeaders(server);

    const AudioLevel lvl = micGetLatestLevel();

    JsonDocument doc;
    doc["rms"]          = lvl.rmsRaw;
    doc["db_fs"]        = lvl.dBFS;
    doc["peak"]         = lvl.peak;
    doc["timestamp_ms"] = lvl.timestampMs;

    String body;
    serializeJson(doc, body);
    server.send(200, "application/json", body);
}

// POST /api/audio/config  { "sample_rate": 44100 }
static void handleAudioConfig(WebServer& server) {
    addCorsHeaders(server);

    // GET — return current config and limits
    if (server.method() == HTTP_GET) {
        JsonDocument doc;
        doc["sample_rate"] = micGetSampleRate();
        doc["min_hz"]      = 8000;
        doc["max_hz"]      = 48000;
        String body;
        serializeJson(doc, body);
        server.send(200, "application/json", body);
        return;
    }

    // POST — change sample rate
    if (!server.hasArg("plain") || server.arg("plain").length() == 0) {
        server.send(400, "application/json", "{\"error\":\"Request body required\"}");
        return;
    }
    JsonDocument req;
    DeserializationError err = deserializeJson(req, server.arg("plain"));
    if (err || !req["sample_rate"].is<uint32_t>()) {
        server.send(400, "application/json", "{\"error\":\"sample_rate (integer) required\"}");
        return;
    }
    const uint32_t rate = req["sample_rate"].as<uint32_t>();
    if (!micSetSampleRate(rate)) {
        server.send(400, "application/json",
                    "{\"error\":\"sample_rate must be 8000\u201348000 Hz\"}");
        return;
    }
    JsonDocument res;
    res["sample_rate"] = micGetSampleRate();
    res["min_hz"]      = 8000;
    res["max_hz"]      = 48000;
    String body;
    serializeJson(res, body);
    server.send(200, "application/json", body);
}

static void handleOptions(WebServer& server) {
    addCorsHeaders(server);
    server.send(204);
}

// ─── WAV recording handler ────────────────────────────────────────────────────
//  GET /api/audio/record?duration_ms=3000
//  Records duration_ms of audio at 16 kHz / 16-bit mono, returns WAV file.
//  Max 5 seconds. Pauses the micTask while owning I2S.

static void buildWavHeader(uint8_t* h, uint32_t sampleRate, uint32_t dataBytes) {
    const uint16_t nCh   = 1;
    const uint16_t bits  = 16;
    const uint32_t br    = sampleRate * nCh * bits / 8;
    const uint16_t ba    = (uint16_t)(nCh * bits / 8);
    const uint32_t csz   = 36 + dataBytes;
    const uint32_t sc1   = 16;
    const uint16_t fmt   = 1;
    memcpy(h + 0,  "RIFF", 4); memcpy(h + 4,  &csz,  4);
    memcpy(h + 8,  "WAVE", 4); memcpy(h + 12, "fmt ", 4);
    memcpy(h + 16, &sc1,   4); memcpy(h + 20, &fmt,   2);
    memcpy(h + 22, &nCh,   2); memcpy(h + 24, &sampleRate, 4);
    memcpy(h + 28, &br,    4); memcpy(h + 32, &ba,    2);
    memcpy(h + 34, &bits,  2); memcpy(h + 36, "data", 4);
    memcpy(h + 40, &dataBytes, 4);
}

static void handleAudioRecord(WebServer& server) {
    addCorsHeaders(server);

    uint32_t durationMs = 3000;
    if (server.hasArg("duration_ms")) {
        int v = server.arg("duration_ms").toInt();
        durationMs = (uint32_t)max(500, min(5000, v));
    }

    // Use current sample rate — avoids switching the I2S clock (causes static at low rates)
    const uint32_t RATE   = micGetSampleRate();
    const uint32_t nSamp  = (RATE * durationMs) / 1000;
    const uint32_t nBytes = nSamp * sizeof(int16_t);

    // Build WAV header — exact size known upfront, no large malloc needed
    uint8_t header[44];
    buildWavHeader(header, RATE, nBytes);

    // Take exclusive ownership of I2S (no rate change needed)
    micSetRecordingPause(true);

    // Flush stale DMA samples (one buffer's worth)
    { int32_t tmp[I2S_DMA_BUF_LEN]; size_t b = 0;
      i2s_read(I2S_PORT, tmp, sizeof(tmp), &b, pdMS_TO_TICKS(200)); }

    // Stream response: send WAV header then PCM in small stack-allocated chunks
    server.sendHeader("Content-Disposition", "inline; filename=\"recording.wav\"");
    server.sendHeader("Cache-Control", "no-cache");
    server.setContentLength(44 + nBytes);
    server.send(200, "audio/wav", "");
    server.sendContent((const char*)header, 44);

    // 64 frames × 4 bytes = 256-byte raw buffer; 64 × 2 bytes = 128-byte PCM output
    static const uint32_t CHUNK = 64;
    int32_t raw[CHUNK];
    int16_t pcm[CHUNK];
    uint32_t recorded = 0;

    while (recorded < nSamp) {
        size_t   bytesRead = 0;
        uint32_t want = min(CHUNK, nSamp - recorded);
        i2s_read(I2S_PORT, raw, want * sizeof(int32_t), &bytesRead, pdMS_TO_TICKS(1000));
        uint32_t n = bytesRead / sizeof(int32_t);
        for (uint32_t i = 0; i < n; i++) {
            pcm[i] = (int16_t)(raw[i] >> 16);  // top 16 of 24-bit INMP441 frame
        }
        server.sendContent((const char*)pcm, n * sizeof(int16_t));
        recorded += n;
    }

    micSetRecordingPause(false);
}

// ─── Public API ──────────────────────────────────────────────────────────────

void httpApiBegin(WebServer& server) {
    server.on("/", HTTP_GET, [&server]() { handleRoot(server); });
    server.on("/api/info", HTTP_GET, [&server]() { handleInfo(server); });
    server.on("/api/audio/level",  HTTP_GET,  [&server]() { handleAudioLevel(server); });
    server.on("/api/audio/config", HTTP_GET,  [&server]() { handleAudioConfig(server); });
    server.on("/api/audio/config", HTTP_POST, [&server]() { handleAudioConfig(server); });
    server.on("/api/audio/record", HTTP_GET,  [&server]() { handleAudioRecord(server); });

    // Handle pre-flight CORS requests
    server.onNotFound([&server]() {
        if (server.method() == HTTP_OPTIONS) {
            handleOptions(server);
        } else {
            addCorsHeaders(server);
            server.send(404, "application/json", "{\"error\":\"Not found\"}");
        }
    });

    server.begin();
    Serial.printf("[HTTP] API server started on port %d\n", HTTP_PORT);
    Serial.printf("[HTTP] Endpoints:\n");
    Serial.printf("         GET http://%s/api/info\n",          WiFi.localIP().toString().c_str());
    Serial.printf("         GET http://%s/api/audio/level\n",   WiFi.localIP().toString().c_str());
    Serial.printf("         GET/POST http://%s/api/audio/config\n", WiFi.localIP().toString().c_str());
}

void httpApiHandle(WebServer& server) {
    server.handleClient();
}
