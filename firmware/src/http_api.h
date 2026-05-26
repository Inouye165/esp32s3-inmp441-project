#pragma once

#include <WebServer.h>

// =============================================================================
// HttpApi — minimal ESP32 REST API server (post streaming-only refactor)
//
// Endpoints:
//   GET /            → 200 OK plain text (root health)
//   GET /api/info    → JSON board + microphone + stream metadata
//   GET /api/health  → JSON liveness / uptime / streaming flag
//
// All audio is delivered out-of-band via the audio_stream TCP task.
// =============================================================================

/** Register all route handlers and start the server. Call after WiFi is up. */
void httpApiBegin(WebServer& server);

/** Must be called from loop() to process incoming HTTP requests. */
void httpApiHandle(WebServer& server);