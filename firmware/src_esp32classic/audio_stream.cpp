#include "audio_stream.h"
#include "config_esp32.h"
#include "i2s_mic.h"

#include <Arduino.h>
#include <WiFi.h>
#include <driver/i2s.h>

// =============================================================================
// TCP raw-PCM streaming task — Core 0.
// Protocol (matches server audioIngestClassic):
//   1. 8-byte preamble: "PCM1" (LE uint32) + sample_rate (LE uint32)
//   2. Raw int16 LE mono PCM @ STREAM_SAMPLE_RATE, forever.
// Auto-reconnects on drop with exponential back-off.
// =============================================================================

static volatile bool s_streaming = false;
bool audioStreamIsActive() { return s_streaming; }

static constexpr uint32_t PREAMBLE_MAGIC = 0x314D4350u; // 'P','C','M','1'

static void audioStreamTask(void* /*pv*/) {
    uint32_t backoffMs = STREAM_RECONNECT_MIN_MS;

    static int32_t rawBuf[AUDIO_BLOCK_SIZE];
    static int16_t outBuf[AUDIO_BLOCK_SIZE];

    for (;;) {
        if (WiFi.status() != WL_CONNECTED) {
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        WiFiClient client;
        Serial.printf("[Stream] Connecting %s:%u …\n", STREAM_HOST, (unsigned)STREAM_PORT);
        if (!client.connect(STREAM_HOST, STREAM_PORT, 5000)) {
            Serial.printf("[Stream] Failed — retry in %lu ms\n", (unsigned long)backoffMs);
            s_streaming = false;
            vTaskDelay(pdMS_TO_TICKS(backoffMs));
            backoffMs = min<uint32_t>(backoffMs * 2, STREAM_RECONNECT_MAX_MS);
            continue;
        }
        client.setNoDelay(true);

        // Flush stale DMA data before sending
        i2s_zero_dma_buffer(I2S_PORT);

        // Fresh DC blocker for each session
        DcBlockerState dc;
        dcBlockerReset(dc);

        // 8-byte preamble
        uint8_t pre[8];
        const uint32_t mag  = PREAMBLE_MAGIC;
        const uint32_t rate = (uint32_t)STREAM_SAMPLE_RATE;
        pre[0] = (uint8_t)(mag  & 0xFF); pre[1] = (uint8_t)((mag  >> 8) & 0xFF);
        pre[2] = (uint8_t)((mag  >> 16) & 0xFF); pre[3] = (uint8_t)((mag  >> 24) & 0xFF);
        pre[4] = (uint8_t)(rate & 0xFF); pre[5] = (uint8_t)((rate >> 8) & 0xFF);
        pre[6] = (uint8_t)((rate >> 16) & 0xFF); pre[7] = (uint8_t)((rate >> 24) & 0xFF);
        if (client.write(pre, 8) != 8) {
            client.stop();
            vTaskDelay(pdMS_TO_TICKS(backoffMs));
            backoffMs = min<uint32_t>(backoffMs * 2, STREAM_RECONNECT_MAX_MS);
            continue;
        }

        Serial.printf("[Stream] Connected — %u Hz  gain=%d  port=%u\n",
                      (unsigned)STREAM_SAMPLE_RATE, STREAM_GAIN, (unsigned)STREAM_PORT);
        backoffMs = STREAM_RECONNECT_MIN_MS;
        s_streaming = true;

        for (;;) {
            if (!client.connected() || WiFi.status() != WL_CONNECTED) break;

            size_t bytesRead = 0;
            const esp_err_t err = i2s_read(I2S_PORT, rawBuf, sizeof(rawBuf),
                                           &bytesRead, pdMS_TO_TICKS(1000));
            if (err != ESP_OK || bytesRead == 0) {
                vTaskDelay(pdMS_TO_TICKS(5));
                continue;
            }

            const int count = (int)(bytesRead / sizeof(int32_t));
            for (int i = 0; i < count; ++i) {
                // INMP441 24-bit audio occupies bits 31:8 of the 32-bit word
                const int32_t raw24   = rawBuf[i] >> 8;
                const float   blocked = dcBlockerProcess(dc, (float)raw24);
                int32_t v = (int32_t)((blocked * (float)STREAM_GAIN) / 256.0f);
                if (v >  32767) v =  32767;
                if (v < -32768) v = -32768;
                outBuf[i] = (int16_t)v;
            }

            const size_t toSend = (size_t)count * sizeof(int16_t);
            size_t sent = 0;
            const uint8_t* p = (const uint8_t*)outBuf;
            while (sent < toSend) {
                const int n = client.write(p + sent, toSend - sent);
                if (n <= 0) goto disconnect;
                sent += (size_t)n;
            }
            continue;
            disconnect:
                break;
        }

        s_streaming = false;
        client.stop();
        Serial.printf("[Stream] Disconnected — retry in %lu ms\n", (unsigned long)backoffMs);
        vTaskDelay(pdMS_TO_TICKS(backoffMs));
        backoffMs = min<uint32_t>(backoffMs * 2, STREAM_RECONNECT_MAX_MS);
    }
}

void audioStreamBegin() {
    xTaskCreatePinnedToCore(audioStreamTask, "audioStream", 8192, nullptr, 5, nullptr, 0);
    Serial.printf("[Stream] Task started — target %s:%u\n", STREAM_HOST, (unsigned)STREAM_PORT);
}
