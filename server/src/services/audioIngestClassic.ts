/**
 * audioIngestClassic — Unit 2 (classic ESP32) TCP PCM receiver.
 *
 * Same wire protocol as audioIngest (Unit 1):
 *   - 8-byte preamble: "PCM1" magic (LE uint32) + sample rate (LE uint32)
 *   - then int16 LE mono PCM, forever
 *
 * Differences from Unit 1:
 *   - No WAV archive files (live waveform only — add archive later if needed)
 *   - Emits 'live-samples' events driving the second SSE endpoint
 *   - Listens on port 8002 (STREAM_INGEST2_PORT)
 */

import { EventEmitter } from 'events';
import net from 'net';
import { config } from '../config';

const PREAMBLE_MAGIC = 0x314d4350; // "PCM1" LE uint32
const PREAMBLE_LEN = 8;
const DB_WINDOW_MS = 200;
const MAX_DB_RING = 600; // ~2 min at 200 ms cadence

export interface IngestClassicStatus {
  enabled: boolean;
  listening: boolean;
  port: number;
  connected: boolean;
  client: string | null;
  sample_rate: number | null;
  bytes_received: number;
  last_error: string | null;
}

export interface LiveSample {
  t_ms: number;
  db_fs: number;
}

class AudioIngestClassicService extends EventEmitter {
  private readonly enabled = config.ingest2.enabled;
  private readonly port = config.ingest2.port;

  private server: net.Server | null = null;
  private currentSocket: net.Socket | null = null;
  private listening = false;
  private clientAddress: string | null = null;

  private sampleRate: number | null = null;
  private gotPreamble = false;
  private preambleBuf = Buffer.alloc(0);

  private bytesReceived = 0;
  private lastError: string | null = null;

  // Live-level ring
  private dbRing: LiveSample[] = [];
  private windowBytes = 0;
  private partialWindow: Buffer[] = [];
  private partialBytes = 0;

  isEnabled(): boolean { return this.enabled; }

  getStatus(): IngestClassicStatus {
    return {
      enabled: this.enabled,
      listening: this.listening,
      port: this.port,
      connected: this.currentSocket !== null,
      client: this.clientAddress,
      sample_rate: this.sampleRate,
      bytes_received: this.bytesReceived,
      last_error: this.lastError,
    };
  }

  getRecentDbSamples(): LiveSample[] {
    return this.dbRing.slice();
  }

  start(): void {
    if (!this.enabled || this.server) return;
    this.server = net.createServer((sock) => this.handleSocket(sock));
    this.server.on('error', (err) => {
      this.lastError = err.message;
      console.error('[Ingest2] server error:', err.message);
    });
    this.server.listen(this.port, () => {
      this.listening = true;
      console.log(`[Ingest2] Listening for classic ESP32 PCM stream on TCP :${this.port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.currentSocket) {
      this.currentSocket.destroy();
      this.currentSocket = null;
    }
    await new Promise<void>((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => resolve());
      this.server = null;
      this.listening = false;
    });
  }

  private handleSocket(sock: net.Socket): void {
    if (this.currentSocket) {
      console.log('[Ingest2] Replacing existing connection');
      this.currentSocket.destroy();
    }
    this.currentSocket = sock;
    this.clientAddress = `${sock.remoteAddress}:${sock.remotePort}`;
    this.gotPreamble = false;
    this.preambleBuf = Buffer.alloc(0);
    this.sampleRate = null;
    this.partialWindow = [];
    this.partialBytes = 0;
    console.log(`[Ingest2] Connected: ${this.clientAddress}`);

    sock.on('data', (chunk: Buffer) => this.onData(chunk));
    sock.on('close', () => {
      if (this.currentSocket === sock) {
        console.log('[Ingest2] Client disconnected');
        this.currentSocket = null;
        this.clientAddress = null;
      }
    });
    sock.on('error', (err) => {
      this.lastError = err.message;
      console.error('[Ingest2] socket error:', err.message);
    });
  }

  private onData(chunk: Buffer): void {
    this.bytesReceived += chunk.length;

    if (!this.gotPreamble) {
      this.preambleBuf = Buffer.concat([this.preambleBuf, chunk]);
      if (this.preambleBuf.length < PREAMBLE_LEN) return;

      const magic = this.preambleBuf.readUInt32LE(0);
      if (magic !== PREAMBLE_MAGIC) {
        console.error('[Ingest2] Bad preamble magic — closing');
        this.currentSocket?.destroy();
        return;
      }
      const rate = this.preambleBuf.readUInt32LE(4);
      this.sampleRate = rate;
      this.windowBytes = Math.round((rate * 2 * DB_WINDOW_MS) / 1000);
      this.gotPreamble = true;
      console.log(`[Ingest2] Preamble OK — ${rate} Hz`);

      // Remainder after preamble
      const rem = this.preambleBuf.slice(PREAMBLE_LEN);
      if (rem.length > 0) this.processPcm(rem);
      return;
    }

    this.processPcm(chunk);
  }

  private processPcm(buf: Buffer): void {
    this.partialWindow.push(buf);
    this.partialBytes += buf.length;

    while (this.partialBytes >= this.windowBytes) {
      const full = Buffer.concat(this.partialWindow);
      const window = full.slice(0, this.windowBytes);
      const rest   = full.slice(this.windowBytes);

      // Compute RMS dBFS over the window
      const samples = window.length / 2;
      let sumSq = 0;
      for (let i = 0; i < samples; i++) {
        const s = window.readInt16LE(i * 2) / 32768.0;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, samples));
      const dbFs = rms > 1e-10 ? 20 * Math.log10(rms) : -90;

      const sample: LiveSample = { t_ms: Date.now(), db_fs: Math.max(-90, dbFs) };
      this.dbRing.push(sample);
      if (this.dbRing.length > MAX_DB_RING) this.dbRing.shift();
      this.emit('live-samples', [sample]);

      this.partialWindow = rest.length > 0 ? [rest] : [];
      this.partialBytes = rest.length;
    }
  }
}

export const audioIngestClassic = new AudioIngestClassicService();
