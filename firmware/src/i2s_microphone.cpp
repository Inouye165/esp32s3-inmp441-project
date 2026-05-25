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
static volatile bool s_pauseForStream = false; // set while audio_stream task owns I2S

// ─── DC blocker (one-pole high-pass) ─────────────────────────────────────────
// INMP441 has a noticeable DC offset that wastes dynamic range and adds
// low-frequency rumble. y[n] = x[n] - x[n-1] + R*y[n-1] with R close to 1.
// R = 0.9975 → roughly 18 Hz cutoff at 44.1 kHz (sub-bass, no voice loss).
void dcBlockerReset(DcBlockerState& s) { s.x1 = 0.0f; s.y1 = 0.0f; }

float dcBlockerProcess(DcBlockerState& s, float x) {
    constexpr float R = 0.9975f;
    const float y = x - s.x1 + R * s.y1;
    s.x1 = x;
    s.y1 = y;
    return y;
}

static DcBlockerState s_liveDc = {0.0f, 0.0f};

// ─── I2S driver installation ─────────────────────────────────────────────────

bool micInit() {
    const i2s_config_t i2s_config = {
        .mode                 = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = I2S_SAMPLE_RATE,
        .bits_per_sample      = i2s_bits_per_sample_t(I2S_BITS),
        // INMP441 datasheet: L/R = GND → audio appears on the LEFT slot.
        // arduino-esp32 v3.x / IDF 5.x fixed the old L/R-swap bug, so use ONLY_LEFT.
        // (Using ONLY_RIGHT here reads the silent half of the I2S frame and produces
        //  a very-low-level signal that sounds like static.)
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
                  I2S_SAMPLE_RATE, I2S_BITS,
                  I2S_SCK_PIN, I2S_WS_PIN, I2S_SD_PIN);
    return true;
}

// ─── Read one block and compute level ────────────────────────────────────────

void micSetRecordingPause(bool pause) {
    s_pauseForRec = pause;
}

void micSetStreamingPause(bool pause) {
    s_pauseForStream = pause;
}

void micPublishLevel(const AudioLevel& level) {
    taskENTER_CRITICAL(&s_mux);
    s_latestLevel = level;
    taskEXIT_CRITICAL(&s_mux);
}

AudioLevel micReadLevel() {
    // Yield while another owner (recording or streaming) has the I2S peripheral
    if (s_pauseForRec || s_pauseForStream) {
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
    // Apply a DC blocker — the INMP441 has a noticeable DC offset that would
    // otherwise dominate the RMS and pin dBFS unnaturally high.
    double sumSquares = 0.0;
    int32_t peak      = 0;
    for (int i = 0; i < count; ++i) {
        const int32_t raw24 = samples[i] >> 8;   // 24-bit signed
        const float   s     = dcBlockerProcess(s_liveDc, (float)raw24);
        sumSquares += (double)s * (double)s;
        const float absSample = s < 0 ? -s : s;
        if (absSample > peak) peak = (int32_t)absSample;
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
