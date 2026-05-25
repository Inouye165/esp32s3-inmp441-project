import dotenv from 'dotenv';
import path from 'path';

// Load local-only overrides first, then fill any missing values from .env.
dotenv.config({ path: '.env.local' });
dotenv.config();

const archiveChunkMs = parseInt(process.env.ARCHIVE_CHUNK_MS ?? '10000', 10);

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  esp32: {
    ip: process.env.ESP32_IP ?? '',
    port: parseInt(process.env.ESP32_PORT ?? '80', 10),
  },
  requestTimeoutMs: 5000,
  archive: {
    recordingsDir: process.env.RECORDINGS_DIR ?? path.resolve(process.cwd(), 'recordings'),
    chunkMs: Number.isFinite(archiveChunkMs) ? Math.min(30000, Math.max(5000, archiveChunkMs)) : 10000,
    autoStart: process.env.ARCHIVE_AUTO_START !== 'false',
  },
} as const;

// Mutable at runtime via POST /api/config
export const runtimeConfig = {
  esp32Ip: config.esp32.ip,
  esp32Port: config.esp32.port,
};
