import dotenv from 'dotenv';
import path from 'path';

// Load local-only overrides first, then fill any missing values from .env.
dotenv.config({ path: '.env.local' });
dotenv.config();

const archiveChunkMs = parseInt(process.env.ARCHIVE_CHUNK_MS ?? '2000', 10);

const ingestEnabled = process.env.STREAM_INGEST_ENABLED === 'true';
const ingest2Enabled = process.env.STREAM_INGEST2_ENABLED === 'true';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  esp32: {
    ip: process.env.ESP32_IP ?? '',
    port: parseInt(process.env.ESP32_PORT ?? '80', 10),
  },
  requestTimeoutMs: 5000,
  archive: {
    recordingsDir: process.env.RECORDINGS_DIR ?? path.resolve(process.cwd(), 'recordings'),
    // Small chunks → fresher live-waveform stream + lower per-request ESP32
    // lockout. Floor at 1 s so we can still play live audio meaningfully.
    chunkMs: Number.isFinite(archiveChunkMs) ? Math.min(30000, Math.max(1000, archiveChunkMs)) : 2000,
    // When the firmware streams PCM straight to the ingest service, the old
    // chunk poller would fight the streaming task for the I2S peripheral.
    // Disable it automatically in that mode (it can still be started on
    // demand via POST /api/archive/start for legacy firmware).
    autoStart: process.env.ARCHIVE_AUTO_START !== 'false' && !ingestEnabled,
  },
  ingest: {
    enabled: ingestEnabled,
    port: parseInt(process.env.STREAM_INGEST_PORT ?? '8001', 10),
  },
  // Unit 2 — classic ESP32 (no archive, live waveform only)
  ingest2: {
    enabled: ingest2Enabled,
    port: parseInt(process.env.STREAM_INGEST2_PORT ?? '8002', 10),
  },
} as const;

// Mutable at runtime via POST /api/config
export const runtimeConfig = {
  esp32Ip: config.esp32.ip,
  esp32Port: config.esp32.port,
};
