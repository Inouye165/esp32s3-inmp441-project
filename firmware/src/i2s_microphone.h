#pragma once

#include <cstdint>

// =============================================================================
// I2sMicrophone — minimal wrapper around the ESP32 I2S driver for the INMP441.
// After the streaming-only refactor, the audio_stream task is the *single*
// owner of the I2S peripheral. No pause flags, no live-level ring, no runtime
// sample-rate switching — the rate is fixed at micInit() and never changes.
// =============================================================================

/**
 * Install and start the I2S driver at STREAM_SAMPLE_RATE.
 * Must be called once before any i2s_read().
 * @return true on success
 */
bool micInit();

/** Current (fixed) sample rate, for /api/info reporting. */
uint32_t micGetSampleRate();

// ─── DC blocker (one-pole high-pass) ─────────────────────────────────────────
// INMP441 has a noticeable DC offset that wastes dynamic range and adds
// low-frequency rumble. The streaming task runs samples through one of these.
struct DcBlockerState { float x1; float y1; };
void  dcBlockerReset(DcBlockerState& s);
float dcBlockerProcess(DcBlockerState& s, float x);