#include "http_api.h"
#include "i2s_microphone.h"
#include "config.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_chip_info.h>
#include <esp_flash.h>
#include <esp_heap_caps.h>
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
//  Records duration_ms of audio at the current I2S sample rate as 16-bit mono
//  WAV. On ESP32-S3 boards with PSRAM, the take is buffered and normalized
//  before being returned so quiet recordings replay at a more usable level.

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

static void sendWavResponse(WebServer& server,
                            const int16_t* pcm,
                            uint32_t sampleRate,
                            uint32_t sampleCount) {
    const uint32_t dataBytes = sampleCount * sizeof(int16_t);
    uint8_t header[44];
    buildWavHeader(header, sampleRate, dataBytes);

    server.sendHeader("Content-Disposition", "inline; filename=\"recording.wav\"");
    server.sendHeader("Cache-Control", "no-cache");
    server.setContentLength(44 + dataBytes);
    server.send(200, "audio/wav", "");
    server.sendContent((const char*)header, 44);

    uint32_t sent = 0;
    while (sent < sampleCount) {
        uint32_t chunk = sampleCount - sent;
        if (chunk > AUDIO_BLOCK_SIZE) chunk = AUDIO_BLOCK_SIZE;
        server.sendContent((const char*)(pcm + sent), chunk * sizeof(int16_t));
        sent += chunk;
    }
}

static void handleAudioRecord(WebServer& server) {
    addCorsHeaders(server);

    uint32_t durationMs = 3000;
    if (server.hasArg("duration_ms")) {
        int v = server.arg("duration_ms").toInt();
        // Cap raised to 30 s. WAV is streamed (no large alloc) so the only
        // real limit is the HTTP socket staying open and the WiFi TX queue.
        durationMs = (uint32_t)max(500, min(30000, v));
    }

    // Tunable gain — caller-provided (default 32 = ~30 dB, good for room voice).
    // The raw INMP441 sample is in bits 31:8 (24-bit signed). Converting to
    // 16-bit at unity gain would be `>> 16`. `gain` then multiplies that result.
    //   gain=1   → no extra boost (very quiet)
    //   gain=16  → +24 dB
    //   gain=32  → +30 dB (default)
    //   gain=64  → +36 dB (likely clipping for normal speech)
    int gain = 32;
    if (server.hasArg("gain")) {
        gain = (int)max(1L, min(256L, (long)server.arg("gain").toInt()));
    }

    // Use current sample rate — avoids switching the I2S clock (causes static at low rates)
    const uint32_t RATE   = micGetSampleRate();
    const uint32_t nSamp  = (RATE * durationMs) / 1000;
    const uint32_t nBytes = nSamp * sizeof(int16_t);

    int16_t* captured = (int16_t*)heap_caps_malloc(nBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!captured) {
        captured = (int16_t*)heap_caps_malloc(nBytes, MALLOC_CAP_8BIT);
    }

    if (!captured) {
        uint8_t header[44];
        buildWavHeader(header, RATE, nBytes);
        server.sendHeader("Content-Disposition", "inline; filename=\"recording.wav\"");
        server.sendHeader("Cache-Control", "no-cache");
        server.setContentLength(44 + nBytes);
        server.send(200, "audio/wav", "");
        server.sendContent((const char*)header, 44);
    }

    // Take exclusive ownership of I2S (no rate change needed)
    micSetRecordingPause(true);
    // micReadLevel() holds i2s_read(portMAX_DELAY) for up to AUDIO_BLOCK_SIZE
    // samples (~12 ms at 44.1 kHz) — wait long enough for it to bail out.
    vTaskDelay(pdMS_TO_TICKS(50));

    // Drain stale DMA buffers. Use the SAME chunk size as micReadLevel
    // (AUDIO_BLOCK_SIZE samples = full DMA-buffer-aligned reads) — the legacy
    // I2S driver returns partial / zeroed data when asked for sub-buffer sizes.
    {
        static int32_t drain[AUDIO_BLOCK_SIZE];
        size_t b = 0;
        for (int d = 0; d < I2S_DMA_BUF_COUNT + 1; d++) {
            i2s_read(I2S_PORT, drain, sizeof(drain), &b, pdMS_TO_TICKS(200));
        }
    }

    // Fresh DC blocker for this recording so we don't inherit state from the
    // live-level path (which may have built up after a long uptime).
    DcBlockerState dc;
    dcBlockerReset(dc);

    // Read AUDIO_BLOCK_SIZE samples per call — proven good with the legacy
    // I2S driver (this is exactly what micReadLevel does).
    static int32_t raw[AUDIO_BLOCK_SIZE];
    static int16_t pcm[AUDIO_BLOCK_SIZE];
    uint32_t recorded = 0;
    int32_t peakAbs   = 0;

    while (recorded < nSamp) {
        size_t   bytesRead = 0;
        uint32_t want      = nSamp - recorded;
        if (want > AUDIO_BLOCK_SIZE) want = AUDIO_BLOCK_SIZE;

        // For the final partial block, still ask for a full block — the driver
        // delivers DMA-buffer-aligned data. We'll just send the bytes we need.
        i2s_read(I2S_PORT, raw, AUDIO_BLOCK_SIZE * sizeof(int32_t),
                 &bytesRead, portMAX_DELAY);
        uint32_t n = bytesRead / sizeof(int32_t);
        if (n > want) n = want;

        for (uint32_t i = 0; i < n; i++) {
            // INMP441: 24-bit audio in bits 31:8 of 32-bit DMA word.
            const int32_t raw24 = raw[i] >> 8;                 // 24-bit signed
            const float   hp    = dcBlockerProcess(dc, (float)raw24);
            // Scale 24-bit → 16-bit (/256) and apply tunable gain.
            // IMPORTANT: do the multiply in float, then cast — otherwise small
            // samples (|hp| < 256) get truncated to 0 before the gain is applied
            // and the recording sounds like static.
            int32_t s = (int32_t)((hp * (float)gain) / 256.0f);
            if      (s >  32767) s =  32767;
            else if (s < -32768) s = -32768;
            pcm[i] = (int16_t)s;
            if (captured) {
                captured[recorded + i] = pcm[i];
                const int32_t absSample = (s < 0) ? -s : s;
                if (absSample > peakAbs) peakAbs = absSample;
            }
        }
        if (!captured) {
            // Fallback for boards without enough RAM: preserve the old
            // streaming behaviour instead of failing the request outright.
            server.sendContent((const char*)pcm, n * sizeof(int16_t));
        }
        recorded += n;
    }

    micSetRecordingPause(false);

    if (!captured) {
        return;
    }

    // Normalize the finished take so replay better matches what was heard in
    // the room. Keep a little headroom and cap extra makeup gain to avoid
    // turning silence into hiss.
    const float targetPeak = 29491.0f; // about -1 dBFS
    float normalize = 1.0f;
    if (peakAbs > 0 && peakAbs < targetPeak) {
        normalize = targetPeak / (float)peakAbs;
        if (normalize > 8.0f) normalize = 8.0f;
    }

    if (normalize > 1.01f) {
        for (uint32_t i = 0; i < nSamp; i++) {
            int32_t s = (int32_t)((float)captured[i] * normalize);
            if      (s >  32767) s =  32767;
            else if (s < -32768) s = -32768;
            captured[i] = (int16_t)s;
        }
    }

    Serial.printf("[Rec] %lu ms @ %lu Hz  peak=%ld  normalize=%.2fx\n",
                  (unsigned long)durationMs,
                  (unsigned long)RATE,
                  (long)peakAbs,
                  (double)normalize);

    sendWavResponse(server, captured, RATE, nSamp);
    heap_caps_free(captured);
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
