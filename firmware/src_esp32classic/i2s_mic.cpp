#include "i2s_mic.h"
#include "config_esp32.h"

#include <Arduino.h>
#include <driver/i2s.h>

bool micInit() {
    Serial.printf("[I2S] Init: SCK=%d  WS=%d  SD=%d  rate=%d Hz  32-bit left-justify\n",
                  I2S_SCK_PIN, I2S_WS_PIN, I2S_SD_PIN, I2S_SAMPLE_RATE);

    const i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = I2S_SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,  // L/R pin tied GND
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = I2S_DMA_BUF_COUNT,
        .dma_buf_len          = I2S_DMA_BUF_LEN,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = 0,
    };
    if (i2s_driver_install(I2S_PORT, &cfg, 0, nullptr) != ESP_OK) {
        Serial.println("[I2S] driver_install failed");
        return false;
    }

    const i2s_pin_config_t pins = {
        .bck_io_num   = I2S_SCK_PIN,
        .ws_io_num    = I2S_WS_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num  = I2S_SD_PIN,
    };
    if (i2s_set_pin(I2S_PORT, &pins) != ESP_OK) {
        Serial.println("[I2S] set_pin failed");
        return false;
    }

    i2s_zero_dma_buffer(I2S_PORT);
    Serial.println("[I2S] Ready.");
    return true;
}

uint32_t micGetSampleRate() {
    return (uint32_t)I2S_SAMPLE_RATE;
}

void dcBlockerReset(DcBlockerState& s) {
    s.x1 = 0.0f;
    s.y1 = 0.0f;
}

float dcBlockerProcess(DcBlockerState& s, float x) {
    // y[n] = x[n] - x[n-1] + 0.995 * y[n-1]
    float y = x - s.x1 + 0.995f * s.y1;
    s.x1 = x;
    s.y1 = y;
    return y;
}
