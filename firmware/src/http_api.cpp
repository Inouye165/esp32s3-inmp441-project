#include "http_api.h"
#include "i2s_microphone.h"
#include "config.h"
#include "audio_stream.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_chip_info.h>
#include <esp_flash.h>
#include <esp_heap_caps.h>
#include <driver/i2s.h>

// ─── CORS helper ─────────────────────────────────────────────────────────────

static void addCorsHeaders(WebServer& server) {
    server.sendHeader("Access-Control-Allow-Origin",  "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ─── Route handlers ──────────────────────────────────────────────────────────

static void handleRoot(WebServer& server) {
    addCorsHeaders(server);
    server.send(200, "text/plain", "ESP32-S3 INMP441 Streamer v" FIRMWARE_VERSION);
}

static void handleHealth(WebServer& server) {
    addCorsHeaders(server);
    JsonDocument doc;
    doc["status"]    = "ok";
    doc["uptime_ms"] = millis();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["streaming"] = audioStreamIsActive();
    doc["free_heap"] = ESP.getFreeHeap();
    String body;
    serializeJson(doc, body);
    server.send(200, "application/json", body);
}

static void handleInfo(WebServer& server) {
    addCorsHeaders(server);

    esp_chip_info_t chip;
    esp_chip_info(&chip);

    uint32_t flashSize = 0;
    esp_flash_get_size(nullptr, &flashSize);

    JsonDocument doc;
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
    doc["streaming"]          = audioStreamIsActive();

    JsonObject mic = doc["microphone"].to<JsonObject>();
    mic["type"]        = MIC_TYPE;
    mic["interface"]   = "I2S";
    mic["sample_rate"] = micGetSampleRate();
    mic["bits"]        = I2S_BITS;
    mic["channel"]     = "Left (L/R=GND)";

    JsonObject stream = doc["stream"].to<JsonObject>();
    stream["protocol"]    = "tcp/raw-pcm";
    stream["port"]        = STREAM_PORT;
    stream["sample_rate"] = STREAM_SAMPLE_RATE;
    stream["bits"]        = 16;
    stream["channels"]    = 1;

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

static void handleOptions(WebServer& server) {
    addCorsHeaders(server);
    server.send(204);
}

// ─── Public API ──────────────────────────────────────────────────────────────

void httpApiBegin(WebServer& server) {
    server.on("/",            HTTP_GET, [&server]() { handleRoot(server); });
    server.on("/api/info",    HTTP_GET, [&server]() { handleInfo(server); });
    server.on("/api/health",  HTTP_GET, [&server]() { handleHealth(server); });

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
    Serial.printf("         GET http://%s/api/info\n",   WiFi.localIP().toString().c_str());
    Serial.printf("         GET http://%s/api/health\n", WiFi.localIP().toString().c_str());
}

void httpApiHandle(WebServer& server) {
    server.handleClient();
}