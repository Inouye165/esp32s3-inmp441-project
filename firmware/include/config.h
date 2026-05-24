#pragma once

// =============================================================================
// WiFi Configuration
// =============================================================================
#define WIFI_SSID     "Dobby"
#define WIFI_PASSWORD "sanmina-1"

// =============================================================================
// INMP441 I2S Pin Configuration
//   INMP441 Pin | ESP32-S3 GPIO
//   ------------|---------------
//   SCK (BCLK)  | GPIO 14
//   WS  (LRCLK) | GPIO 15
//   SD  (DOUT)  | GPIO 32
//   L/R         | GND  (Left channel)
//   VDD         | 3.3V
//   GND         | GND
//
// NOTE: GPIO32 is used for SPI flash/PSRAM on ESP32-S3 boards that have
// Octal flash or PSRAM (N8R8 variants). If you see I2S read errors, your
// board may have GPIO32 reserved. In that case, move SD to an available GPIO
// (e.g. GPIO38, GPIO39, GPIO40) and update I2S_SD_PIN below.
// =============================================================================
#define I2S_SCK_PIN   14   // Serial Clock (Bit Clock)
#define I2S_WS_PIN    15   // Word Select (Left/Right Clock)
#define I2S_SD_PIN    32   // Serial Data (microphone output)

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
#define FIRMWARE_VERSION  "1.0.0"
#define BOARD_NAME        "ESP32-DevKit"
#define MIC_TYPE          "INMP441"
