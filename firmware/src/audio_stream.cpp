#include "audio_stream.h"
#include "config.h"
#include "i2s_microphone.h"

#include <Arduino.h>
#include <WiFi.h>
#include <driver/i2s.h>

// =============================================================================
// Streaming task — the SOLE owner of the I2S peripheral. Pinned to Core 0 to
// keep the HTTP server + Arduino loop on Core 1 responsive.
//
// Protocol (server-side audioIngest is the consumer):
//   1. 8-byte preamble: "PCM1" magic (LE uint32) + sample rate (LE uint32)
//   2. Raw int16 LE mono PCM @ STREAM_SAMPLE_RATE, forever
// On disconnect we reconnect with exponential backoff.
// =============================================================================

static volatile bool s_streaming = false;

bool audioStreamIsActive() { return s_streaming; }

static constexpr uint32_t PREAMBLE_MAGIC = 0x314D4350u; // 'P','C','M','1'

static void audioStreamTask(void* /*pv*/) {
    uint32_t backoffMs = STREAM_RECONNECT_MIN_MS;

    static int32_t rawSamples[AUDIO_BLOCK_SIZE];
    static int16_t outSamples[AUDIO_BLOCK_SIZE];

    for (;;) {
#ifndef STREAM_HOST
        // No host configured — sleep forever (no-op task).
        vTaskDelay(pdMS_TO_TICKS(60000));
        continue;
#else
        const char* host = STREAM_HOST;
        if (host == nullptr || host[0] == '\0') {
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }

        if (WiFi.status() != WL_CONNECTED) {
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        WiFiClient client;
        Serial.printf("[Stream] Connecting to %s:%u\n", host, (unsigned)STREAM_PORT);
        if (!client.connect(host, STREAM_PORT, 5000)) {
            Serial.printf("[Stream] connect failed, retry in %lu ms\n", (unsigned long)backoffMs);
            vTaskDelay(pdMS_TO_TICKS(backoffMs));
            backoffMs = min<uint32_t>(backoffMs * 2, STREAM_RECONNECT_MAX_MS);
            continue;
        }

        client.setNoDelay(true);

        // Fresh DC blocker for this session.
        i2s_zero_dma_buffer(I2S_PORT);
        DcBlockerState dc; dcBlockerReset(dc);

        // Send 8-byte preamble.
        uint8_t pre[8];
        pre[0] = (uint8_t)(PREAMBLE_MAGIC & 0xFF);
        pre[1] = (uint8_t)((PREAMBLE_MAGIC >> 8)  & 0xFF);
        pre[2] = (uint8_t)((PREAMBLE_MAGIC >> 16) & 0xFF);
        pre[3] = (uint8_t)((PREAMBLE_MAGIC >> 24) & 0xFF);
        const uint32_t rate = (uint32_t)STREAM_SAMPLE_RATE;
        pre[4] = (uint8_t)(rate & 0xFF);
        pre[5] = (uint8_t)((rate >> 8) & 0xFF);
        pre[6] = (uint8_t)((rate >> 16) & 0xFF);
        pre[7] = (uint8_t)((rate >> 24) & 0xFF);
        if (client.write(pre, 8) != 8) {
            Serial.println("[Stream] preamble write failed");
            client.stop();
            vTaskDelay(pdMS_TO_TICKS(backoffMs));
            backoffMs = min<uint32_t>(backoffMs * 2, STREAM_RECONNECT_MAX_MS);
            continue;
        }

        Serial.printf("[Stream] Connected — %u Hz, gain=%d\n",
                      (unsigned)STREAM_SAMPLE_RATE, STREAM_GAIN);
        backoffMs = STREAM_RECONNECT_MIN_MS;
        s_streaming = true;

        // ─── Main streaming loop ─────────────────────────────────────────────
        for (;;) {
            if (!client.connected()) break;
            if (WiFi.status() != WL_CONNECTED) break;

            size_t bytesRead = 0;
            esp_err_t err = i2s_read(I2S_PORT,
                                     rawSamples,
                                     sizeof(rawSamples),
                                     &bytesRead,
                                     pdMS_TO_TICKS(1000));
            if (err != ESP_OK || bytesRead == 0) {
                vTaskDelay(pdMS_TO_TICKS(5));
                continue;
            }

            const int count = (int)(bytesRead / sizeof(int32_t));
            for (int i = 0; i < count; ++i) {
                // INMP441: 24-bit sample in bits 31:8 of 32-bit DMA word.
                const int32_t raw24   = rawSamples[i] >> 8;
                const float   blocked = dcBlockerProcess(dc, (float)raw24);
                // 24→16 bit (>>8) then apply gain. Float math first to avoid
                // truncating small samples to zero before the multiply.
                int32_t v = (int32_t)((blocked * (float)STREAM_GAIN) / 256.0f);
                if (v >  32767) v =  32767;
                if (v < -32768) v = -32768;
                outSamples[i] = (int16_t)v;
            }

            const size_t toSend = (size_t)count * sizeof(int16_t);
            size_t sent = 0;
            const uint8_t* p = (const uint8_t*)outSamples;
            while (sent < toSend) {
                int n = client.write(p + sent, toSend - sent);
                if (n <= 0) { sent = 0; break; }
                sent += (size_t)n;
            }
            if (sent == 0) {
                Serial.println("[Stream] write failed, dropping connection");
                break;
            }
        }

        // ─── Disconnect cleanup ─────────────────────────────────────────────
        s_streaming = false;
        client.stop();
        Serial.printf("[Stream] Disconnected, retry in %lu ms\n", (unsigned long)backoffMs);
        vTaskDelay(pdMS_TO_TICKS(backoffMs));
        backoffMs = min<uint32_t>(backoffMs * 2, STREAM_RECONNECT_MAX_MS);
#endif // STREAM_HOST
    }
}

void audioStreamBegin() {
    xTaskCreatePinnedToCore(
        audioStreamTask,
        "audioStream",
        8192,
        nullptr,
        3,
        nullptr,
        0          // Core 0
    );
}