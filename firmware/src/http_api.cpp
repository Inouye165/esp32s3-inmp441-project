#include "http_api.h"
#include "i2s_microphone.h"
#include "config.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_chip_info.h>
#include <esp_flash.h>

// ─── CORS helper ─────────────────────────────────────────────────────────────

static void addCorsHeaders(WebServer& server) {
    server.sendHeader("Access-Control-Allow-Origin",  "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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
    mic["sample_rate"] = I2S_SAMPLE_RATE;
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

static void handleOptions(WebServer& server) {
    addCorsHeaders(server);
    server.send(204);
}

// ─── Public API ──────────────────────────────────────────────────────────────

void httpApiBegin(WebServer& server) {
    server.on("/", HTTP_GET, [&server]() { handleRoot(server); });
    server.on("/api/info", HTTP_GET, [&server]() { handleInfo(server); });
    server.on("/api/audio/level", HTTP_GET, [&server]() { handleAudioLevel(server); });

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
}

void httpApiHandle(WebServer& server) {
    server.handleClient();
}
