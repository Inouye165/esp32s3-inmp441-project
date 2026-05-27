#include "http_api.h"
#include "config_esp32.h"
#include "i2s_mic.h"
#include "audio_stream.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_chip_info.h>

static void cors(WebServer& s) {
    s.sendHeader("Access-Control-Allow-Origin",  "*");
    s.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    s.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

static void handleRoot(WebServer& s) {
    cors(s);
    s.send(200, "text/plain",
           "Classic ESP32 INMP441 Streamer v" FIRMWARE_VERSION "\n"
           "Board: " BOARD_NAME "\n"
           "GET /api/info  — board + mic JSON\n"
           "GET /api/health — liveness JSON\n");
}

static void handleHealth(WebServer& s) {
    cors(s);
    JsonDocument doc;
    doc["status"]    = "ok";
    doc["uptime_ms"] = millis();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["streaming"] = audioStreamIsActive();
    doc["free_heap"] = ESP.getFreeHeap();
    String body; serializeJson(doc, body);
    s.send(200, "application/json", body);
}

static void handleInfo(WebServer& s) {
    cors(s);

    esp_chip_info_t chip;
    esp_chip_info(&chip);

    const char* chipStr;
    switch (chip.model) {
        case CHIP_ESP32:   chipStr = "ESP32";    break;
        case CHIP_ESP32S2: chipStr = "ESP32-S2"; break;
        case CHIP_ESP32S3: chipStr = "ESP32-S3"; break;
        case CHIP_ESP32C3: chipStr = "ESP32-C3"; break;
        default:           chipStr = "ESP32 (other)"; break;
    }

    JsonDocument doc;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["board"]            = BOARD_NAME;
    doc["chip_model"]       = chipStr;
    doc["chip_revision"]    = chip.revision;
    doc["chip_cores"]       = chip.cores;
    doc["free_heap_bytes"]  = ESP.getFreeHeap();
    doc["sdk_version"]      = ESP.getSdkVersion();
    doc["mac"]              = WiFi.macAddress();
    doc["ip"]               = WiFi.localIP().toString();
    doc["ssid"]             = WiFi.SSID();
    doc["rssi_dbm"]         = WiFi.RSSI();
    doc["uptime_ms"]        = millis();
    doc["streaming"]        = audioStreamIsActive();

    JsonObject mic = doc["microphone"].to<JsonObject>();
    mic["type"]        = MIC_TYPE;
    mic["interface"]   = "I2S";
    mic["sample_rate"] = micGetSampleRate();
    mic["bits"]        = I2S_BITS;
    mic["channel"]     = "Left (L/R=GND)";

    JsonObject pins = mic["pins"].to<JsonObject>();
    pins["sck"] = I2S_SCK_PIN;
    pins["ws"]  = I2S_WS_PIN;
    pins["sd"]  = I2S_SD_PIN;
    pins["lr"]  = "GND (Left channel)";
    pins["vdd"] = "3.3V";

    JsonObject stream = doc["stream"].to<JsonObject>();
    stream["protocol"]    = "tcp/raw-pcm";
    stream["host"]        = STREAM_HOST;
    stream["port"]        = STREAM_PORT;
    stream["sample_rate"] = STREAM_SAMPLE_RATE;
    stream["bits"]        = 16;
    stream["channels"]    = 1;

    String body; serializeJson(doc, body);
    s.send(200, "application/json", body);
}

void httpApiBegin(WebServer& s) {
    s.on("/",           [&s]() { handleRoot(s);   });
    s.on("/api/info",   [&s]() { handleInfo(s);   });
    s.on("/api/health", [&s]() { handleHealth(s); });
    s.onNotFound([&s]() {
        cors(s);
        s.send(404, "application/json", "{\"error\":\"not found\"}");
    });
    s.begin();
    Serial.printf("[HTTP] API listening on port %d\n", HTTP_PORT);
}

void httpApiHandle(WebServer& s) {
    s.handleClient();
}
