#pragma once

// =============================================================================
// WiFi Configuration — credentials live in secrets.h (gitignored)
// =============================================================================
#include "secrets.h"
// WIFI_SSID and WIFI_PASSWORD are defined in secrets.h

// =============================================================================
// INMP441 I2S Pin Configuration
//   INMP441 Pin | ESP32 GPIO
//   ------------|---------------
//   SCK (BCLK)  | GPIO 14
//   WS  (LRCLK) | GPIO 15
//   SD  (DOUT)  | GPIO 33
//   L/R         | GND  (Left channel)
//   VDD         | 3.3V
//   GND         | GND
//
// NOTE: GPIO 32 was previously used for SD, but on classic ESP32 DevKit
// boards GPIO 32 doubles as 32K_XP (the 32 kHz oscillator input). When the
// 32 kHz crystal is populated (common on DevKit V1 boards) GPIO 32 cannot
// be driven as a general-purpose digital input \u2014 you get clocked bits
// but no real audio (a constant ~\u221225 dBFS noise floor that doesn't
// respond to sound). GPIO 33 is the natural neighbour and has no such
// conflict. If GPIO 33 is also taken on your board, GPIO 25/26/27 also
// work. AVOID 34\u201339 (input-only, no internal pull-up).
// =============================================================================
#define I2S_SCK_PIN    4   // Serial Clock (Bit Clock)   \u2014 orange
#define I2S_WS_PIN     5   // Word Select (Left/Right)   \u2014 yellow
#define I2S_SD_PIN     6   // Serial Data (mic output)   \u2014 brown

// =============================================================================
// I2S Driver Settings
// =============================================================================
#define I2S_PORT          I2S_NUM_0
#define I2S_SAMPLE_RATE   44100    // Hz
#define I2S_BITS          32       // INMP441 outputs 24-bit in a 32-bit frame
#define I2S_DMA_BUF_COUNT 8
#define I2S_DMA_BUF_LEN   256      // samples per DMA buffer

// Number of samples to accumulate per RMS calculation
#define AUDIO_BLOCK_SIZE  512

// =============================================================================
// HTTP API Server
// =============================================================================
#define HTTP_PORT 80

// =============================================================================
// Board Identity
// =============================================================================
#define FIRMWARE_VERSION  "1.1.0"
#define BOARD_NAME        "ESP32-S3-WROOM-1 (N16R8)"
#define MIC_TYPE          "INMP441"
