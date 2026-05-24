/**
 * Esp32Service — typed access to the ESP32 REST API.
 *
 * The parse* functions are pure (no I/O) and tested independently.
 * The fetch* functions handle HTTP + timeout concerns.
 */

import { config } from '../config';
import type { AudioLevel, BoardInfo } from '../types/index';

// ─── Pure parse helpers (testable) ───────────────────────────────────────────

export function parseAudioLevel(data: unknown): AudioLevel {
  if (typeof data !== 'object' || data === null) {
    throw new TypeError('AudioLevel payload must be an object');
  }
  const d = data as Record<string, unknown>;

  const rms = Number(d['rms']);
  const db_fs = Number(d['db_fs']);
  const peak = Number(d['peak']);
  const timestamp_ms = Number(d['timestamp_ms']);

  if (!Number.isFinite(rms) || !Number.isFinite(db_fs) ||
      !Number.isFinite(peak) || !Number.isFinite(timestamp_ms)) {
    throw new TypeError('AudioLevel contains non-numeric fields');
  }

  return { rms, db_fs, peak, timestamp_ms };
}

export function parseBoardInfo(data: unknown): BoardInfo {
  if (typeof data !== 'object' || data === null) {
    throw new TypeError('BoardInfo payload must be an object');
  }
  const d = data as Record<string, unknown>;

  const requiredStrings = ['firmware_version', 'board', 'chip_model',
    'sdk_version', 'mac', 'ip', 'ssid'] as const;

  for (const key of requiredStrings) {
    if (typeof d[key] !== 'string') {
      throw new TypeError(`BoardInfo missing or invalid field: ${key}`);
    }
  }

  if (typeof d['microphone'] !== 'object' || d['microphone'] === null) {
    throw new TypeError('BoardInfo missing microphone object');
  }

  return d as unknown as BoardInfo;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function buildBaseUrl(ip: string, port: number): string {
  return port === 80 ? `http://${ip}` : `http://${ip}:${port}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`ESP32 returned HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAudioLevel(ip: string, port = 80): Promise<AudioLevel> {
  const url = `${buildBaseUrl(ip, port)}/api/audio/level`;
  const data = await fetchJson(url);
  return parseAudioLevel(data);
}

export async function fetchBoardInfo(ip: string, port = 80): Promise<BoardInfo> {
  const url = `${buildBaseUrl(ip, port)}/api/info`;
  const data = await fetchJson(url);
  return parseBoardInfo(data);
}
