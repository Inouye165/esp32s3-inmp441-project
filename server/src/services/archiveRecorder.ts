import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

import { config, runtimeConfig } from '../config';
import { ArchiveChunkSummary, ArchiveStatus } from '../types';

type StoredChunk = ArchiveChunkSummary & { absolute_path: string };

// Window size used when reducing PCM to a dBFS time series for the live-feed
// stream. 200 ms matches the frontend chart's POLL_INTERVAL_MS so each
// archive chunk yields chunk_ms/200 chart points that drop in smoothly.
const SAMPLE_WINDOW_MS = 200;

export interface ArchiveLiveSample {
  t_ms: number;   // wall-clock midpoint of this window
  db_fs: number;  // -90..0
}

const INDEX_FILE = 'index.jsonl';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPosixPath(value: string) {
  return value.replace(/\\/g, '/');
}

function buildEsp32BaseUrl() {
  if (!runtimeConfig.esp32Ip) return '';
  return runtimeConfig.esp32Port === 80
    ? `http://${runtimeConfig.esp32Ip}`
    : `http://${runtimeConfig.esp32Ip}:${runtimeConfig.esp32Port}`;
}

function parseWavMetadata(buffer: Buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Invalid WAV header');
  }
  const sampleRate = buffer.readUInt32LE(24);
  const dataBytes = buffer.readUInt32LE(40);
  const sampleCount = Math.max(0, Math.floor(dataBytes / 2));
  const pcm = new Int16Array(buffer.buffer, buffer.byteOffset + 44, sampleCount);
  let peak = 0;
  for (let index = 0; index < pcm.length; index++) {
    const abs = Math.abs(pcm[index] ?? 0);
    if (abs > peak) peak = abs;
  }
  const peakDbfs = peak > 0 ? 20 * Math.log10(peak / 32768) : -90;
  const durationMs = sampleRate > 0 ? Math.round((sampleCount * 1000) / sampleRate) : 0;
  return {
    sampleRate,
    durationMs,
    peakDbfs: Math.max(-90, Math.min(0, peakDbfs)),
    pcm,
  };
}

function computeLiveSamples(
  pcm: Int16Array,
  sampleRate: number,
  startMs: number,
): ArchiveLiveSample[] {
  if (sampleRate <= 0 || pcm.length === 0) return [];
  const windowSamples = Math.max(1, Math.floor((sampleRate * SAMPLE_WINDOW_MS) / 1000));
  const samples: ArchiveLiveSample[] = [];
  for (let offset = 0; offset < pcm.length; offset += windowSamples) {
    const end = Math.min(pcm.length, offset + windowSamples);
    let sumSquares = 0;
    for (let index = offset; index < end; index++) {
      const value = pcm[index] ?? 0;
      sumSquares += value * value;
    }
    const count = end - offset;
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    const db = rms > 0 ? 20 * Math.log10(rms / 32768) : -90;
    const midpointMs = startMs + Math.round(((offset + count / 2) * 1000) / sampleRate);
    samples.push({
      t_ms: midpointMs,
      db_fs: Math.max(-90, Math.min(0, db)),
    });
  }
  return samples;
}

class ArchiveRecorderService extends EventEmitter {
  private readonly recordingsDir = config.archive.recordingsDir;
  private readonly indexPath = path.join(this.recordingsDir, INDEX_FILE);
  private readonly chunkMs = config.archive.chunkMs;
  private readonly chunks: StoredChunk[] = [];
  private readonly recentLiveSamples: ArchiveLiveSample[] = [];
  private readonly maxRecentLiveSamples = 600; // ≈ 2 min of 200 ms windows
  private initialized = false;
  private enabled = config.archive.autoStart;
  private capturing = false;
  private loopPromise: Promise<void> | null = null;
  private lastError: string | null = null;

  getRecentLiveSamples(sinceMs?: number) {
    if (sinceMs === undefined) return this.recentLiveSamples.slice();
    return this.recentLiveSamples.filter((sample) => sample.t_ms > sinceMs);
  }

  async init() {
    if (this.initialized) return;
    await fs.mkdir(this.recordingsDir, { recursive: true });
    try {
      const content = await fs.readFile(this.indexPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as ArchiveChunkSummary;
        this.chunks.push({
          ...parsed,
          absolute_path: path.join(this.recordingsDir, parsed.relative_path),
        });
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
    }
    this.initialized = true;
  }

  start() {
    this.enabled = true;
    if (!this.loopPromise) {
      this.loopPromise = this.runLoop().finally(() => {
        this.loopPromise = null;
      });
    }
  }

  stop() {
    this.enabled = false;
  }

  getStatus(): ArchiveStatus {
    const earliest = this.chunks[0]?.start_ms ?? null;
    const latest = this.chunks[this.chunks.length - 1]?.end_ms ?? null;
    return {
      enabled: this.enabled,
      capturing: this.capturing,
      chunk_ms: this.chunkMs,
      chunk_count: this.chunks.length,
      earliest_start_ms: earliest,
      latest_end_ms: latest,
      last_error: this.lastError,
    };
  }

  listChunks(windowMs: number, endMs?: number) {
    const effectiveEndMs = endMs ?? this.getStatus().latest_end_ms ?? Date.now();
    const effectiveStartMs = effectiveEndMs - windowMs;
    return this.chunks.filter((chunk) => chunk.end_ms >= effectiveStartMs && chunk.start_ms <= effectiveEndMs);
  }

  getChunkById(id: string) {
    return this.chunks.find((chunk) => chunk.id === id) ?? null;
  }

  // Returns chunks whose audio overlaps [startMs, endMs], in chronological
  // order, including their absolute file path. Used by the range-stitch
  // endpoint to produce a single WAV for playback or download.
  getChunkFilesInRange(startMs: number, endMs: number): StoredChunk[] {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
    return this.chunks
      .filter((chunk) => chunk.end_ms > startMs && chunk.start_ms < endMs)
      .slice()
      .sort((a, b) => a.start_ms - b.start_ms);
  }

  private async runLoop() {
    while (this.enabled) {
      const baseUrl = buildEsp32BaseUrl();
      if (!baseUrl) {
        await delay(2000);
        continue;
      }

      try {
        this.capturing = true;
        await this.captureChunk(baseUrl);
        this.lastError = null;
      } catch (error) {
        this.lastError = (error as Error).message;
        await delay(3000);
      } finally {
        this.capturing = false;
      }
    }
  }

  private async captureChunk(baseUrl: string) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.chunkMs + 20000);

    try {
      const response = await fetch(`${baseUrl}/api/audio/record?duration_ms=${this.chunkMs}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`ESP32 recorder returned HTTP ${response.status}`);
      }

      const wavBuffer = Buffer.from(await response.arrayBuffer());
      const wav = parseWavMetadata(wavBuffer);
      const endMs = startedAt + wav.durationMs;
      const relativePath = toPosixPath(path.join(
        new Date(startedAt).getUTCFullYear().toString(),
        String(new Date(startedAt).getUTCMonth() + 1).padStart(2, '0'),
        String(new Date(startedAt).getUTCDate()).padStart(2, '0'),
        String(new Date(startedAt).getUTCHours()).padStart(2, '0'),
        `chunk-${startedAt}.wav`,
      ));
      const absolutePath = path.join(this.recordingsDir, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, wavBuffer);

      const chunk: StoredChunk = {
        id: String(startedAt),
        start_ms: startedAt,
        end_ms: endMs,
        duration_ms: wav.durationMs,
        sample_rate: wav.sampleRate,
        size_bytes: wavBuffer.byteLength,
        relative_path: relativePath,
        peak_dbfs: wav.peakDbfs,
        absolute_path: absolutePath,
      };

      this.chunks.push(chunk);
      await fs.appendFile(this.indexPath, `${JSON.stringify({
        id: chunk.id,
        start_ms: chunk.start_ms,
        end_ms: chunk.end_ms,
        duration_ms: chunk.duration_ms,
        sample_rate: chunk.sample_rate,
        size_bytes: chunk.size_bytes,
        relative_path: chunk.relative_path,
        peak_dbfs: chunk.peak_dbfs,
      })}\n`);

      const liveSamples = computeLiveSamples(wav.pcm, wav.sampleRate, startedAt);
      if (liveSamples.length > 0) {
        for (const sample of liveSamples) this.recentLiveSamples.push(sample);
        if (this.recentLiveSamples.length > this.maxRecentLiveSamples) {
          this.recentLiveSamples.splice(0, this.recentLiveSamples.length - this.maxRecentLiveSamples);
        }
        this.emit('live-samples', liveSamples);
      }
      this.emit('chunk', { id: chunk.id, start_ms: chunk.start_ms, end_ms: chunk.end_ms });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const archiveRecorder = new ArchiveRecorderService();