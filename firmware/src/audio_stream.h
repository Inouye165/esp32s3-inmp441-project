#pragma once

// =============================================================================
// Phase 6 — TCP raw-PCM streaming task
//
// Connects to STREAM_HOST:STREAM_PORT (see config.h / secrets.h), sends an
// 8-byte preamble ("PCM1" magic + LE sample rate), then continuously streams
// int16-LE mono PCM frames produced from the I2S microphone. Re-connects with
// exponential backoff if the link drops.
//
// When the task holds an active connection it gates the micTask off via
// micSetStreamingPause(true) and publishes AudioLevels through micPublishLevel
// so /api/audio/level keeps responding.
// =============================================================================

/** Start the streaming task. Safe to call once from setup(). */
void audioStreamBegin();

/** Returns true while the TCP connection to the ingest server is up. */
bool audioStreamIsActive();
