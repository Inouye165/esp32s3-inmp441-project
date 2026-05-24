#pragma once

#include <WebServer.h>

// =============================================================================
// HttpApi — ESP32 REST API server
//
// Endpoints:
//   GET /           → 200 OK (health check)
//   GET /api/info   → JSON board & microphone metadata
//   GET /api/audio/level → JSON current audio level (poll as fast as desired)
// =============================================================================

/**
 * Register all route handlers and start the server.
 * Must be called after WiFi is connected.
 */
void httpApiBegin(WebServer& server);

/**
 * Must be called from loop() to process incoming HTTP requests.
 */
void httpApiHandle(WebServer& server);
