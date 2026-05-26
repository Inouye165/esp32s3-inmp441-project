#include "i2s_microphone.h"
#include "config.h"

#include <driver/i2s.h>
#include <Arduino.h>

// ─── DC blocker (one-pole high-pass) ─────────────────────────────────────────
// y[n] = x[n] - x[n-1] + R*y[n-1] with R close to 1.
// R = 0.9975 → ~18 Hz cutoff at 44.1 kHz (sub-bass, no voice loss).
void dcBlockerReset(DcBlockerState& s) { s.x1 = 0.0f; s.y1 = 0.0f; }

float dcBlockerProcess(DcBlockerState& s, float x) {
    constexpr float R = 0.9975f;
    const float y = x - s.x1 + R * s.y1;
    s.x1 = x;
    s.y1 = y;
    return y;
}

// ─── I2S driver installation ─────────────────────────────────────────────────

bool micInit() {
    const i2s_config_t i2s_config = {
        .mode                 = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = STREAM_SAMPLE_RATE,
        .bits_per_sample      = i2s_bits_per_sample_t(I2S_BITS),
        // INMP441: L/R = GND → audio on the LEFT slot. ONLY_LEFT is correct
        // on arduino-esp32 v3.x / IDF 5.x (the old L/R-swap bug is fixed).
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = I2S_DMA_BUF_COUNT,
        .dma_buf_len          = I2S_DMA_BUF_LEN,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = 0,
    };

    esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, nullptr);
    if (err != ESP_OK) {
        Serial.printf("[Mic] i2s_driver_install failed: %s\n", esp_err_to_name(err));
        return false;
    }

    const i2s_pin_config_t pin_config = {
        .mck_io_num   = I2S_PIN_NO_CHANGE,
        .bck_io_num   = I2S_SCK_PIN,
        .ws_io_num    = I2S_WS_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num  = I2S_SD_PIN,
    };

    err = i2s_set_pin(I2S_PORT, &pin_config);
    if (err != ESP_OK) {
        Serial.printf("[Mic] i2s_set_pin failed: %s\n", esp_err_to_name(err));
        return false;
    }

    i2s_zero_dma_buffer(I2S_PORT);
    Serial.printf("[Mic] I2S ready — %d Hz / %d-bit — SCK:%d WS:%d SD:%d\n",
                  STREAM_SAMPLE_RATE, I2S_BITS,
                  I2S_SCK_PIN, I2S_WS_PIN, I2S_SD_PIN);
    return true;
}

uint32_t micGetSampleRate() {
    return STREAM_SAMPLE_RATE;
}