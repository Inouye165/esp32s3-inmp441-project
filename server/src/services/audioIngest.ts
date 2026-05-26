/**
 * Audio ingest service — Phase 6.
 *
 * Listens on a TCP port for the ESP32 streaming task. The ESP sends:
 *   - 8-byte preamble: "PCM1" magic (4 bytes ASCII, little-endian uint32)
 *                      + sample rate (uint32 LE, Hz)
 *   - then int16 little-endian mono PCM, forever.
 *
 * As bytes arrive we:
 *   1. Append them to a rolling per-hour WAV file on disk (so HTTP Range
 *      playback works without any chunk-stitching).
 *   2. Slice them into 200 ms windows and emit a dBFS sample for each
 *      (drives the live waveform + lets the playback chart show
 *      historical waveforms by wall-clock time, not by file).
 *   3. Keep the last ~60 s of dBFS samples in memory for fast queries.
 *
 * Reconnects: if the ESP drops and comes back within a few seconds, we
 * zero-fill the gap into the hour file so byte-offset ↔ wall-clock math
 * stays exact. If the gap is larger we just reset audio-time to wall-time.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';
import path from 'path';

import { config } from '../config';
import { ArchiveLiveSample } from './archiveRecorder';

const PREAMBLE_MAGIC = 0x314D4350; // "PCM1" read as LE uint32
const PREAMBLE_LEN = 8;
const WAV_HEADER_SIZE = 44;
const DB_WINDOW_MS = 200;
const MS_PER_HOUR = 3_600_000;
const MAX_DB_RING_SAMPLES = 1200; // ≈ 4 min at 200 ms cadence
const RECONNECT_GAP_LIMIT_MS = 30_000; // gaps larger than this are not zero-filled
const STREAM_INDEX_FILE = 'index.jsonl';

export interface IngestStatus {
  enabled: boolean;
  listening: boolean;
  port: number;
  connected: boolean;
  client: string | null;
  sample_rate: number | null;
  bytes_received: number;
  audio_clock_ms: number | null;
  stream_start_ms: number | null;
  hour_files: number;
  current_hour_start_ms: number | null;
  last_gap_ms: number | null;
  last_error: string | null;
}

interface HourFileMeta {
  start_ms: number;     // wall-clock time of data byte 0
  hour_bucket_ms: number;
  sample_rate: number;
  relative_path: string;
  absolute_path: string;
  bytes_written: number; // PCM bytes (excluding 44-byte header)
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function buildWavPlaceholderHeader(sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(WAV_HEADER_SIZE);
  header.write('RIFF', 0);
  header.writeUInt32LE(0, 4); // chunk size — patched on flush/close
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(0, 40); // data size — patched on flush/close
  return header;
}

function hourBucketOf(ms: number): number {
  return Math.floor(ms / MS_PER_HOUR) * MS_PER_HOUR;
}

class AudioIngestService extends EventEmitter {
  private readonly enabled = config.ingest.enabled;
  private readonly port = config.ingest.port;
  private readonly streamDir = path.join(config.archive.recordingsDir, 'stream');
  private readonly indexPath = path.join(this.streamDir, STREAM_INDEX_FILE);

  private server: net.Server | null = null;
  private currentSocket: net.Socket | null = null;
  private listening = false;
  private gotPreamble = false;
  private preambleBuf = Buffer.alloc(0);
  private clientAddress: string | null = null;

  private sampleRate: number | null = null;
  private bytesPerSample = 2;
  private windowBytes = 0;

  private streamStartMs: number | null = null;
  private audioClockMs: number | null = null;
  private bytesReceived = 0;
  private lastGapMs: number | null = null;
  private lastError: string | null = null;

  private partialWindow: Buffer[] = [];
  private partialBytes = 0;

  private currentHour: HourFileMeta | null = null;
  private currentHourFd: fs.promises.FileHandle | null = null;
  private currentHourBucket: number | null = null;
  private hourFiles: HourFileMeta[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  private dbRing: ArchiveLiveSample[] = [];

  isEnabled(): boolean {
    return this.enabled;
  }

  getStatus(): IngestStatus {
    return {
      enabled: this.enabled,
      listening: this.listening,
      port: this.port,
      connected: this.currentSocket !== null,
      client: this.clientAddress,
      sample_rate: this.sampleRate,
      bytes_received: this.bytesReceived,
      audio_clock_ms: this.audioClockMs,
      stream_start_ms: this.streamStartMs,
      hour_files: this.hourFiles.length,
      current_hour_start_ms: this.currentHour?.start_ms ?? null,
      last_gap_ms: this.lastGapMs,
      last_error: this.lastError,
    };
  }

  getRecentDbSamples(sinceMs?: number): ArchiveLiveSample[] {
    if (sinceMs === undefined) return this.dbRing.slice();
    return this.dbRing.filter((s) => s.t_ms > sinceMs);
  }

  // True if any hour file (or the live ring) covers any portion of the range.
  hasDataInRange(startMs: number, endMs: number): boolean {
    if (this.audioClockMs !== null && startMs < this.audioClockMs && endMs > (this.streamStartMs ?? 0)) {
      return true;
    }
    for (const f of this.hourFiles) {
      const fEnd = f.start_ms + this.bytesToMs(f.bytes_written, f.sample_rate);
      if (fEnd > startMs && f.start_ms < endMs) return true;
    }
    return false;
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    await fsp.mkdir(this.streamDir, { recursive: true });
    try {
      const content = await fsp.readFile(this.indexPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const meta = JSON.parse(line) as Omit<HourFileMeta, 'absolute_path'>;
        this.hourFiles.push({
          ...meta,
          absolute_path: path.join(this.streamDir, meta.relative_path),
        });
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw err;
    }
  }

  start(): void {
    if (!this.enabled || this.server) return;
    this.server = net.createServer((sock) => this.handleSocket(sock));
    this.server.on('error', (err) => {
      this.lastError = err.message;
      console.error('[Ingest] server error:', err.message);
    });
    this.server.listen(this.port, () => {
      this.listening = true;
      console.log(`[Ingest] listening for PCM stream on TCP :${this.port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.currentSocket) {
      try { this.currentSocket.destroy(); } catch { /* ignore */ }
      this.currentSocket = null;
      this.clientAddress = null;
    }
    if (this.server) {
      const srv = this.server;
      this.server = null;
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      this.listening = false;
      console.log('[Ingest] listener stopped');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  private handleSocket(sock: net.Socket): void {
    if (this.currentSocket) {
      // Refuse second connection; keep the existing stream stable.
      sock.destroy(new Error('another client already streaming'));
      return;
    }
    this.currentSocket = sock;
    this.clientAddress = `${sock.remoteAddress}:${sock.remotePort}`;
    this.gotPreamble = false;
    this.preambleBuf = Buffer.alloc(0);
    sock.setNoDelay(true);
    console.log(`[Ingest] client connected from ${this.clientAddress}`);
    this.emit('connection', true);

    sock.on('data', (chunk) => {
      try {
        this.onData(chunk);
      } catch (err) {
        this.lastError = (err as Error).message;
        console.error('[Ingest] data error:', this.lastError);
        sock.destroy();
      }
    });

    const cleanup = () => {
      if (this.currentSocket === sock) {
        this.currentSocket = null;
        this.clientAddress = null;
        console.log('[Ingest] client disconnected');
        this.emit('connection', false);
      }
    };
    sock.on('close', cleanup);
    sock.on('error', (err) => {
      this.lastError = err.message;
      cleanup();
    });
  }

  private onData(chunk: Buffer): void {
    if (!this.gotPreamble) {
      this.preambleBuf = Buffer.concat([this.preambleBuf, chunk]);
      if (this.preambleBuf.length < PREAMBLE_LEN) return;
      const magic = this.preambleBuf.readUInt32LE(0);
      if (magic !== PREAMBLE_MAGIC) {
        throw new Error(`bad preamble magic 0x${magic.toString(16)}`);
      }
      const rate = this.preambleBuf.readUInt32LE(4);
      if (rate < 8000 || rate > 48000) {
        throw new Error(`bad preamble sample rate ${rate}`);
      }
      const remainder = this.preambleBuf.subarray(PREAMBLE_LEN);
      this.preambleBuf = Buffer.alloc(0);
      this.beginStream(rate);
      this.gotPreamble = true;
      if (remainder.length > 0) this.appendPcm(remainder);
      return;
    }
    this.appendPcm(chunk);
  }

  private beginStream(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.windowBytes = Math.max(2, Math.floor((sampleRate * this.bytesPerSample * DB_WINDOW_MS) / 1000));
    if (this.windowBytes % 2 === 1) this.windowBytes += 1;

    const now = Date.now();
    if (this.audioClockMs === null) {
      // Fresh start.
      this.streamStartMs = now;
      this.audioClockMs = now;
      this.lastGapMs = null;
    } else {
      const gap = now - this.audioClockMs;
      if (gap > RECONNECT_GAP_LIMIT_MS || gap < 0) {
        // Too big — reset, no zero-fill.
        this.streamStartMs = now;
        this.audioClockMs = now;
        this.lastGapMs = gap;
      } else if (gap > 0) {
        // Bridge the gap with silence so timeline math stays valid.
        this.lastGapMs = gap;
        this.scheduleWrite(() => this.writeSilence(gap));
      }
    }
    this.partialWindow = [];
    this.partialBytes = 0;
    console.log(
      `[Ingest] stream started rate=${sampleRate}Hz ` +
        `audioClock=${new Date(this.audioClockMs ?? now).toISOString()}`,
    );
  }

  private appendPcm(buf: Buffer): void {
    // Ensure even-byte alignment (int16 samples).
    if (buf.length % 2 === 1) {
      buf = buf.subarray(0, buf.length - 1);
      if (buf.length === 0) return;
    }
    this.bytesReceived += buf.length;
    this.scheduleWrite(() => this.writePcmToHourFile(buf));
    this.feedDbWindows(buf);
  }

  // Serializes async file writes so out-of-order awaits never interleave
  // header patches with appends. All writes hop through this queue.
  private scheduleWrite(task: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(task).catch((err) => {
      this.lastError = (err as Error).message;
      console.error('[Ingest] write error:', this.lastError);
    });
  }

  private async writePcmToHourFile(buf: Buffer): Promise<void> {
    if (this.sampleRate === null || this.audioClockMs === null) return;
    let remaining = buf;
    while (remaining.length > 0) {
      const audioMs: number = this.audioClockMs as number;
      const bucket = hourBucketOf(audioMs);
      if (this.currentHourBucket !== bucket) {
        await this.openNewHourFile(bucket, audioMs);
      }
      const hourEndMs = bucket + MS_PER_HOUR;
      const bytesLeftInHour = Math.max(
        0,
        Math.floor(((hourEndMs - audioMs) * this.sampleRate * this.bytesPerSample) / 1000),
      );
      const writeNow = bytesLeftInHour <= 0
        ? remaining
        : remaining.subarray(0, Math.min(remaining.length, bytesLeftInHour));
      if (writeNow.length === 0) {
        // Defensive: shouldn't happen given the check above; bail to avoid spin.
        break;
      }
      if (this.currentHourFd && this.currentHour) {
        await this.currentHourFd.write(writeNow);
        this.currentHour.bytes_written += writeNow.length;
      }
      const advancedMs = this.bytesToMs(writeNow.length, this.sampleRate);
      this.audioClockMs = audioMs + advancedMs;
      remaining = remaining.subarray(writeNow.length);
      if (remaining.length > 0) {
        // We just filled the rest of the current hour; flush header so the
        // file is immediately playable, then loop to open the next hour.
        await this.flushCurrentHourHeader();
      }
    }
  }

  private async writeSilence(durationMs: number): Promise<void> {
    if (this.sampleRate === null || this.audioClockMs === null) return;
    const bytes = Math.floor((durationMs * this.sampleRate * this.bytesPerSample) / 1000);
    if (bytes <= 0) return;
    const silence = Buffer.alloc(Math.min(bytes, this.sampleRate * this.bytesPerSample)); // 1 s zero buffer reused
    let left = bytes;
    while (left > 0) {
      const slice = left >= silence.length ? silence : silence.subarray(0, left);
      await this.writePcmToHourFile(slice);
      left -= slice.length;
    }
  }

  private async openNewHourFile(bucket: number, audioMs: number): Promise<void> {
    if (this.currentHourFd) {
      await this.flushCurrentHourHeader();
      await this.currentHourFd.close();
      this.currentHourFd = null;
      // Append to index now that the file's start_ms + sample_rate are known
      // and we have written at least one byte.
      if (this.currentHour) {
        this.hourFiles.push(this.currentHour);
        await fsp.appendFile(
          this.indexPath,
          `${JSON.stringify({
            start_ms: this.currentHour.start_ms,
            hour_bucket_ms: this.currentHour.hour_bucket_ms,
            sample_rate: this.currentHour.sample_rate,
            relative_path: this.currentHour.relative_path,
            bytes_written: this.currentHour.bytes_written,
          })}\n`,
        );
      }
    }
    if (this.sampleRate === null) return;
    const date = new Date(audioMs);
    const yyyy = date.getUTCFullYear().toString();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const rel = toPosixPath(path.join(yyyy, mm, dd, `hour-${yyyy}${mm}${dd}-${hh}Z.wav`));
    const abs = path.join(this.streamDir, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const fd = await fsp.open(abs, 'w');
    await fd.write(buildWavPlaceholderHeader(this.sampleRate));
    this.currentHour = {
      start_ms: audioMs,
      hour_bucket_ms: bucket,
      sample_rate: this.sampleRate,
      relative_path: rel,
      absolute_path: abs,
      bytes_written: 0,
    };
    this.currentHourFd = fd;
    this.currentHourBucket = bucket;
    console.log(`[Ingest] new hour file ${rel} (start ${new Date(audioMs).toISOString()})`);
  }

  private async flushCurrentHourHeader(): Promise<void> {
    if (!this.currentHourFd || !this.currentHour) return;
    const dataBytes = this.currentHour.bytes_written;
    const riffSize = Buffer.alloc(4);
    riffSize.writeUInt32LE(36 + dataBytes, 0);
    await this.currentHourFd.write(riffSize, 0, 4, 4);
    const dataSize = Buffer.alloc(4);
    dataSize.writeUInt32LE(dataBytes, 0);
    await this.currentHourFd.write(dataSize, 0, 4, 40);
    await this.currentHourFd.sync().catch(() => undefined);
  }

  private feedDbWindows(buf: Buffer): void {
    if (this.windowBytes === 0 || this.sampleRate === null || this.audioClockMs === null) return;
    this.partialWindow.push(buf);
    this.partialBytes += buf.length;
    while (this.partialBytes >= this.windowBytes) {
      // Concatenate just enough to extract one window.
      const combined = Buffer.concat(this.partialWindow);
      const window = combined.subarray(0, this.windowBytes);
      const rest = combined.subarray(this.windowBytes);
      this.partialWindow = rest.length > 0 ? [rest] : [];
      this.partialBytes = rest.length;

      const sampleCount = window.length / 2;
      let sumSquares = 0;
      for (let i = 0; i < window.length; i += 2) {
        const s = window.readInt16LE(i);
        sumSquares += s * s;
      }
      const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
      const db = rms > 0 ? 20 * Math.log10(rms / 32768) : -90;
      // audioClockMs currently points at the *next* sample to be received;
      // back off by half the window so the timestamp is the window's midpoint.
      const midpointMs = this.audioClockMs - DB_WINDOW_MS / 2;
      const sample: ArchiveLiveSample = {
        t_ms: midpointMs,
        db_fs: Math.max(-90, Math.min(0, db)),
      };
      this.dbRing.push(sample);
      if (this.dbRing.length > MAX_DB_RING_SAMPLES) {
        this.dbRing.splice(0, this.dbRing.length - MAX_DB_RING_SAMPLES);
      }
      this.emit('live-samples', [sample]);
    }
  }

  // ─── Read API used by /api/archive/audio-range and /db-series ──────────────

  async readPcmRange(
    startMs: number,
    endMs: number,
  ): Promise<{ sampleRate: number; pcm: Buffer } | null> {
    if (!this.enabled) return null;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

    // Include in-progress current hour by snapshotting it.
    const files: HourFileMeta[] = this.hourFiles.slice();
    if (this.currentHour) files.push({ ...this.currentHour });

    const candidates = files
      .filter((f) => f.bytes_written > 0)
      .filter((f) => {
        const fEnd = f.start_ms + this.bytesToMs(f.bytes_written, f.sample_rate);
        return fEnd > startMs && f.start_ms < endMs;
      })
      .sort((a, b) => a.start_ms - b.start_ms);

    if (candidates.length === 0) return null;
    const sampleRate = candidates[0].sample_rate;
    const parts: Buffer[] = [];

    for (const f of candidates) {
      const fEnd = f.start_ms + this.bytesToMs(f.bytes_written, f.sample_rate);
      const sliceStart = Math.max(startMs, f.start_ms);
      const sliceEnd = Math.min(endMs, fEnd);
      if (sliceEnd <= sliceStart) continue;
      const offsetInPcm = this.alignDown(
        Math.floor(((sliceStart - f.start_ms) * f.sample_rate * this.bytesPerSample) / 1000),
        this.bytesPerSample,
      );
      const length = this.alignDown(
        Math.floor(((sliceEnd - sliceStart) * f.sample_rate * this.bytesPerSample) / 1000),
        this.bytesPerSample,
      );
      if (length <= 0) continue;
      try {
        const fh = await fsp.open(f.absolute_path, 'r');
        try {
          const buf = Buffer.alloc(length);
          const { bytesRead } = await fh.read(buf, 0, length, WAV_HEADER_SIZE + offsetInPcm);
          if (bytesRead > 0) parts.push(buf.subarray(0, bytesRead));
        } finally {
          await fh.close();
        }
      } catch {
        // skip unreadable file
      }
    }

    if (parts.length === 0) return null;
    return { sampleRate, pcm: Buffer.concat(parts) };
  }

  async getDbSeriesInRange(startMs: number, endMs: number): Promise<ArchiveLiveSample[]> {
    if (!this.enabled) return [];
    const ringHits = this.dbRing.filter((s) => s.t_ms >= startMs && s.t_ms <= endMs);
    const oldestRing = this.dbRing.length > 0 ? this.dbRing[0].t_ms : Infinity;
    // If the entire requested range is covered by the in-memory ring, we're done.
    if (oldestRing <= startMs) return ringHits.sort((a, b) => a.t_ms - b.t_ms);

    // Otherwise, fill the older portion from disk PCM.
    const diskEnd = Math.min(endMs, isFinite(oldestRing) ? oldestRing : endMs);
    const disk = await this.readPcmRange(startMs, diskEnd);
    const out: ArchiveLiveSample[] = [];
    if (disk) {
      const { sampleRate, pcm } = disk;
      const windowSamples = Math.max(1, Math.floor((sampleRate * DB_WINDOW_MS) / 1000));
      const sampleBytes = windowSamples * 2;
      const numWindows = Math.floor(pcm.length / sampleBytes);
      for (let w = 0; w < numWindows; w++) {
        const off = w * sampleBytes;
        let sumSquares = 0;
        for (let i = 0; i < sampleBytes; i += 2) {
          const s = pcm.readInt16LE(off + i);
          sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / windowSamples);
        const db = rms > 0 ? 20 * Math.log10(rms / 32768) : -90;
        const midpointMs = startMs + w * DB_WINDOW_MS + DB_WINDOW_MS / 2;
        out.push({ t_ms: midpointMs, db_fs: Math.max(-90, Math.min(0, db)) });
      }
    }
    for (const s of ringHits) out.push(s);
    return out.sort((a, b) => a.t_ms - b.t_ms);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private bytesToMs(bytes: number, sampleRate: number): number {
    return (bytes * 1000) / (sampleRate * this.bytesPerSample);
  }

  private alignDown(value: number, multiple: number): number {
    return value - (value % multiple);
  }
}

export const audioIngest = new AudioIngestService();
