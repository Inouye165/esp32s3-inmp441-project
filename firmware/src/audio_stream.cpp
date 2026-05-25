#include "audio_stream.h"
#include "config.h"
#include "i2s_microphone.h"

#include <Arduino.h>
#include <WiFi.h>
#include <driver/i2s.h>
#include <cmath>

// =============================================================================
// Streaming task — owns I2S while a TCP link is up. Pinned to Core 0 to
// keep the HTTP server + Arduino loop on Core 1 responsive.
// =============================================================================

static volatile bool s_streaming = false;

bool audioStreamIsActive() { return s_streaming; }

// Match the server protocol: little-endian "PCM1" magic followed by LE rate.
static constexpr uint32_t PREAMBLE_MAGIC = 0x314D4350u; // 'P','C','M','1'

// Reconfigure I2S to the streaming sample rate. Returns previous rate so we
// can restore it on disconnect.
static uint32_t switchToStreamingRate() {
    const uint32_t prev = micGetSampleRate();
    if (prev != STREAM_SAMPLE_RATE) {
        micSetSampleRate(STREAM_SAMPLE_RATE);
    }
    return prev;
}

static void audioStreamTask(void* /*pv*/) {
    uint32_t backoffMs = STREAM_RECONNECT_MIN_MS;

    // Buffers re-used across reconnects.
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

        // Take over I2S from micTask, then reset the DC blocker for a fresh start.
        micSetStreamingPause(true);
        vTaskDelay(pdMS_TO_TICKS(20)); // let micTask see the pause
        i2s_zero_dma_buffer(I2S_PORT);
        const uint32_t prevRate = switchToStreamingRate();
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
            micSetSampleRate(prevRate);
            micSetStreamingPause(false);
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
            double sumSquares = 0.0;
            int32_t peak24 = 0;

            for (int i = 0; i < count; ++i) {
                const int32_t raw24 = rawSamples[i] >> 8;             // 24-bit signed
                const float   blocked = dcBlockerProcess(dc, (float)raw24);

                // dBFS stats (24-bit domain) for /api/audio/level parity.
                sumSquares += (double)blocked * (double)blocked;
                const float a = blocked < 0 ? -blocked : blocked;
                if ((int32_t)a > peak24) peak24 = (int32_t)a;

                // Convert to 16-bit with gain. 24→16 is `>>8`; gain multiplies.
                int32_t v = (int32_t)(blocked) >> 8;                  // 16-bit base
                v *= STREAM_GAIN;
                if (v >  32767) v =  32767;
                if (v < -32768) v = -32768;
                outSamples[i] = (int16_t)v;
            }

            // Publish a fresh AudioLevel so /api/audio/level stays live.
            const float rms = (float)sqrt(sumSquares / (double)count);
            constexpr float FS_24BIT = 8388608.0f;
            const float dBFS = (rms > 0.0f) ? 20.0f * log10f(rms / FS_24BIT) : -90.0f;
            AudioLevel lvl = {rms, dBFS, peak24, (uint32_t)millis()};
            micPublishLevel(lvl);

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
        micSetSampleRate(prevRate);
        micSetStreamingPause(false);
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
        3,        // higher than micTask so it gets I2S promptly
        nullptr,
        0         // Core 0, alongside micTask
    );
}
