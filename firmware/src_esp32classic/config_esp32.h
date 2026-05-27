#pragma once

// =============================================================================
// Unit 2 — Classic ESP32 (ESP32-D0WD-V3 / DevKit V1) INMP441 config
// WiFi credentials live in secrets_esp32.h  (gitignored)
// =============================================================================
#include "secrets_esp32.h"

// =============================================================================
// INMP441 I2S Pin Configuration — Classic ESP32 DevKit V1
//   INMP441 Pin | ESP32 GPIO | Notes
//   ------------|------------|-------------------------------
//   SCK (BCLK)  | GPIO 26    | safe output, no conflicts
//   WS  (LRCLK) | GPIO 25    | safe output (DAC1 unused)
//   SD  (DOUT)  | GPIO 34    | input-only — perfect for mic data
//   L/R         | GND        | Left channel selected
//   VDD         | 3.3V       |
//   GND         | GND        |
// =============================================================================
#define I2S_SCK_PIN   26
#define I2S_WS_PIN    25
#define I2S_SD_PIN    34   // input-only GPIO — fine for I2S data-in

// =============================================================================
// I2S driver settings
// =============================================================================
#define I2S_PORT          I2S_NUM_0
#define I2S_SAMPLE_RATE   16000     // Hz  (stream rate matches STREAM_SAMPLE_RATE)
#define I2S_BITS          32        // INMP441 outputs 24-bit in 32-bit frame
#define I2S_DMA_BUF_COUNT 8
#define I2S_DMA_BUF_LEN   256       // samples per DMA buffer

#define AUDIO_BLOCK_SIZE  256       // 32-bit samples per I2S read

// =============================================================================
// HTTP API
// =============================================================================
#define HTTP_PORT 80

// =============================================================================
// TCP raw-PCM streaming
//   STREAM_HOST defined in secrets_esp32.h
// =============================================================================
#define STREAM_PORT              8002   // unit 2 uses port 8002
#define STREAM_SAMPLE_RATE       16000
#define STREAM_GAIN              32
#define STREAM_RECONNECT_MIN_MS  500
#define STREAM_RECONNECT_MAX_MS  8000

// =============================================================================
// Board identity
// =============================================================================
#define FIRMWARE_VERSION  "1.0.0"
#define BOARD_NAME        "Classic ESP32-D0WD (DevKit V1)"
#define MIC_TYPE          "INMP441"
