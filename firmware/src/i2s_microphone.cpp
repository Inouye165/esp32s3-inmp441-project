#include "i2s_microphone.h"
#include "config.h"

#include <driver/i2s.h>
#include <Arduino.h>
#include <cmath>

// Protected by a critical section (portMUX) so the HTTP task can safely read
// the latest level without data races.
static portMUX_TYPE  s_mux          = portMUX_INITIALIZER_UNLOCKED;
static AudioLevel    s_latestLevel  = {0.0f, -90.0f, 0, 0};
static uint32_t      s_sampleRate   = I2S_SAMPLE_RATE;
static volatile bool s_pauseForRec  = false;  // set while handleAudioRecord owns I2S

// ─── I2S driver installation ─────────────────────────────────────────────────

bool micInit() {
    const i2s_config_t i2s_config = {
        .mode                 = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = I2S_SAMPLE_RATE,
        .bits_per_sample      = i2s_bits_per_sample_t(I2S_BITS),
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,   // L/R pin tied to GND
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
                  I2S_SAMPLE_RATE, I2S_BITS,
                  I2S_SCK_PIN, I2S_WS_PIN, I2S_SD_PIN);
    return true;
}

// ─── Read one block and compute level ────────────────────────────────────────

void micSetRecordingPause(bool pause) {
    s_pauseForRec = pause;
}

AudioLevel micReadLevel() {
    // Yield while the HTTP handler owns the I2S peripheral for WAV recording
    if (s_pauseForRec) {
        vTaskDelay(pdMS_TO_TICKS(10));
        return micGetLatestLevel();
    }

    static int32_t samples[AUDIO_BLOCK_SIZE];
    size_t bytesRead = 0;

    i2s_read(I2S_PORT,
             samples,
             sizeof(samples),
             &bytesRead,
             portMAX_DELAY);

    const int count = bytesRead / sizeof(int32_t);
    if (count == 0) {
        return s_latestLevel;
    }

    // The INMP441 puts the 24-bit sample in bits [31:8] of the 32-bit word.
    // Shift right by 8 so we get a proper 24-bit signed integer before squaring.
    double sumSquares = 0.0;
    int32_t peak      = 0;
    for (int i = 0; i < count; ++i) {
        const int32_t s = samples[i] >> 8;   // 24-bit signed
        sumSquares += static_cast<double>(s) * s;
        const int32_t absSample = (s < 0) ? -s : s;
        if (absSample > peak) peak = absSample;
    }

    const float rms = static_cast<float>(sqrt(sumSquares / count));

    // Full-scale reference for 24-bit signed: 2^23 = 8 388 608
    constexpr float FS_24BIT = 8388608.0f;
    const float dBFS = (rms > 0.0f)
        ? 20.0f * log10f(rms / FS_24BIT)
        : -90.0f;

    AudioLevel level = {rms, dBFS, peak, static_cast<uint32_t>(millis())};

    taskENTER_CRITICAL(&s_mux);
    s_latestLevel = level;
    taskEXIT_CRITICAL(&s_mux);

    return level;
}

AudioLevel micGetLatestLevel() {
    taskENTER_CRITICAL(&s_mux);
    AudioLevel copy = s_latestLevel;
    taskEXIT_CRITICAL(&s_mux);
    return copy;
}

bool micSetSampleRate(uint32_t rateHz) {
    if (rateHz < 8000 || rateHz > 48000) return false;
    esp_err_t err = i2s_set_sample_rates(I2S_PORT, rateHz);
    if (err == ESP_OK) {
        taskENTER_CRITICAL(&s_mux);
        s_sampleRate = rateHz;
        taskEXIT_CRITICAL(&s_mux);
        Serial.printf("[Mic] Sample rate changed to %u Hz\n", rateHz);
    } else {
        Serial.printf("[Mic] i2s_set_sample_rates failed: %s\n", esp_err_to_name(err));
    }
    return err == ESP_OK;
}

uint32_t micGetSampleRate() {
    taskENTER_CRITICAL(&s_mux);
    uint32_t rate = s_sampleRate;
    taskEXIT_CRITICAL(&s_mux);
    return rate;
}
