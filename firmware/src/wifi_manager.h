#pragma once

#include <cstdint>

// =============================================================================
// WiFiManager — handles WiFi connection with retry logic
// =============================================================================

/**
 * Attempt to connect to the configured WiFi network.
 * Blocks until connected or times out.
 *
 * @param timeoutMs  Maximum wait time in milliseconds (default 15 000)
 * @return true if connected, false on timeout
 */
bool wifiConnect(uint32_t timeoutMs = 15000);

/** Returns true if WiFi is currently connected. */
bool wifiIsConnected();

/** Returns the current local IP as a string, or empty string if not connected. */
const char* wifiGetIP();

/** Returns the RSSI of the current connection (0 if not connected). */
int32_t wifiGetRSSI();
