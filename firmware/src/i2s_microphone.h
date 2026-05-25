#pragma once

#include <cstdint>

// =============================================================================
// I2sMicrophone — wraps the ESP32 I2S driver for the INMP441
// =============================================================================

struct AudioLevel {
    float rmsRaw;    // raw RMS of the 32-bit I2S samples
    float dBFS;      // dBFS  (0 dBFS = full scale, negative values)
    int32_t peak;    // absolute peak sample in the last block
    uint32_t timestampMs;
};

/**
 * Install and start the I2S driver.
 * Must be called once before readLevel().
 * @return true on success
 */
bool micInit();

/**
 * Read one block of audio, compute RMS and peak, return the result.
 * Blocks until enough samples are available from the DMA buffers.
 * Expected call cadence: as fast as possible from a dedicated FreeRTOS task.
 */
AudioLevel micReadLevel();

/**
 * Pause/resume the micTask's I2S reads while a WAV recording is in progress.
 * Must be called before the recording handler reads I2S directly.
 */
void micSetRecordingPause(bool pause);

/** Return a snapshot of the most recently computed AudioLevel. Thread-safe. */
AudioLevel micGetLatestLevel();

/**
 * Change the I2S sample rate at runtime (valid range: 8 000–48 000 Hz).
 * Uses i2s_set_sample_rates() which reconfigures the clock without
 * stopping DMA. Returns true on success.
 */
bool     micSetSampleRate(uint32_t rateHz);

/** Return the currently configured sample rate (Hz). */
uint32_t micGetSampleRate();

// ─── DC blocker (one-pole high-pass) ─────────────────────────────────────────
// Shared between the live level loop and the WAV recording handler so the
// INMP441's DC offset is removed everywhere it matters.
struct DcBlockerState { float x1; float y1; };
void  dcBlockerReset(DcBlockerState& s);
float dcBlockerProcess(DcBlockerState& s, float x);
