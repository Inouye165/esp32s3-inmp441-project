import dotenv from 'dotenv';

// Load local-only overrides first, then fill any missing values from .env.
dotenv.config({ path: '.env.local' });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  esp32: {
    ip: process.env.ESP32_IP ?? '',
    port: parseInt(process.env.ESP32_PORT ?? '80', 10),
  },
  requestTimeoutMs: 5000,
} as const;

// Mutable at runtime via POST /api/config
export const runtimeConfig = {
  esp32Ip: config.esp32.ip,
  esp32Port: config.esp32.port,
};
