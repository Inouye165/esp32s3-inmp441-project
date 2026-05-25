import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import { config, runtimeConfig } from '../config';
import { archiveRecorder } from '../services/archiveRecorder';
import { audioIngest } from '../services/audioIngest';
import { fetchAudioLevel, fetchBoardInfo } from '../services/esp32Service';

const router = Router();

// ─── GET /api/config — return current ESP32 connection settings ──────────────

router.get('/config', (_req: Request, res: Response) => {
  res.json({ ip: runtimeConfig.esp32Ip, port: runtimeConfig.esp32Port });
});

// ─── POST /api/config — set ESP32 IP / port ──────────────────────────────────

router.post('/config', (req: Request, res: Response) => {
  const { ip, port } = req.body as { ip?: unknown; port?: unknown };

  if (typeof ip !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    res.status(400).json({ error: 'ip must be a valid IPv4 address' });
    return;
  }

  const portNum = port !== undefined ? Number(port) : runtimeConfig.esp32Port;
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    res.status(400).json({ error: 'port must be an integer between 1 and 65535' });
    return;
  }

  runtimeConfig.esp32Ip = ip;
  runtimeConfig.esp32Port = portNum;
  archiveRecorder.start();
  res.json({ ip: runtimeConfig.esp32Ip, port: runtimeConfig.esp32Port });
});

// ─── Proxy helpers ────────────────────────────────────────────────────────────

function requireEsp32Config(res: Response): boolean {
  if (!runtimeConfig.esp32Ip) {
    res.status(503).json({
      error: 'ESP32 IP not configured. POST /api/config with { "ip": "x.x.x.x" }',
    });
    return false;
  }
  return true;
}

// ─── GET /api/proxy/info — proxy board info from ESP32 ───────────────────────

let lastInfoCache: { value: unknown; at: number } | null = null;

router.get('/proxy/info', async (_req: Request, res: Response) => {
  if (!requireEsp32Config(res)) return;
  try {
    const info = await fetchBoardInfo(runtimeConfig.esp32Ip, runtimeConfig.esp32Port);
    lastInfoCache = { value: info, at: Date.now() };
    res.json(info);
  } catch (err) {
    if (lastInfoCache && Date.now() - lastInfoCache.at < 120000) {
      res.json({ ...(lastInfoCache.value as object), stale: true });
      return;
    }
    res.status(503).json({ error: `ESP32 busy: ${(err as Error).message}`, busy: true });
  }
});

// ─── GET /api/proxy/audio/level — proxy live audio level from ESP32 ──────────

// Cache the last successful level read so the proxy can hand it back when
// the ESP32 is locked out by an in-flight archive recording instead of
// returning 502 every 200 ms (which spams the browser console).
let lastLevelCache: { value: unknown; at: number } | null = null;

router.get('/proxy/audio/level', async (_req: Request, res: Response) => {
  if (!requireEsp32Config(res)) return;
  try {
    const level = await fetchAudioLevel(runtimeConfig.esp32Ip, runtimeConfig.esp32Port);
    lastLevelCache = { value: level, at: Date.now() };
    res.json(level);
  } catch (err) {
    // Within 5 s of a successful read, return the cached value with a flag so
    // the frontend can ignore it for chart updates without logging an error.
    if (lastLevelCache && Date.now() - lastLevelCache.at < 5000) {
      res.json({ ...(lastLevelCache.value as object), stale: true });
      return;
    }
    res.status(503).json({ error: `ESP32 busy: ${(err as Error).message}`, busy: true });
  }
});

// ─── POST /api/proxy/audio/config — change ESP32 sample rate ─────────────────

router.post('/proxy/audio/config', async (req: Request, res: Response) => {
  if (!requireEsp32Config(res)) return;
  const base = runtimeConfig.esp32Port === 80
    ? `http://${runtimeConfig.esp32Ip}`
    : `http://${runtimeConfig.esp32Ip}:${runtimeConfig.esp32Port}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    const esp32Res = await fetch(`${base}/api/audio/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data: unknown = await esp32Res.json();
    res.status(esp32Res.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `Cannot reach ESP32: ${(err as Error).message}` });
  }
});

// ─── GET /api/proxy/audio/record — record WAV from ESP32 microphone ──────────
// Params: duration_ms (500–5000, default 3000)
// Returns: audio/wav binary — 16 kHz / 16-bit mono PCM

router.get('/proxy/audio/record', async (req: Request, res: Response) => {
  if (!requireEsp32Config(res)) return;
  const base = runtimeConfig.esp32Port === 80
    ? `http://${runtimeConfig.esp32Ip}`
    : `http://${runtimeConfig.esp32Ip}:${runtimeConfig.esp32Port}`;

  const durationMs = Math.min(30000, Math.max(500,
    parseInt(String(req.query['duration_ms'] ?? '3000'), 10) || 3000));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), durationMs + 15000);
    req.on('close', () => { clearTimeout(timer); controller.abort(); });

    const esp32Res = await fetch(`${base}/api/audio/record?duration_ms=${durationMs}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!esp32Res.ok) {
      if (!res.headersSent) res.status(esp32Res.status).json({ error: 'ESP32 recording failed' });
      return;
    }

    const wavBuffer = await esp32Res.arrayBuffer();
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wavBuffer.byteLength));
    res.setHeader('Cache-Control', 'no-cache');
    res.end(Buffer.from(wavBuffer));
  } catch (err: unknown) {
    if (!res.headersSent) {
      res.status(502).json({ error: `Cannot reach ESP32: ${(err as Error).message}` });
    }
  }
});

router.get('/archive/status', (_req: Request, res: Response) => {
  res.json(archiveRecorder.getStatus());
});

// Phase 6: PCM ingest status (TCP audio stream from firmware).
router.get('/stream/status', (_req: Request, res: Response) => {
  res.json(audioIngest.getStatus());
});

router.post('/archive/start', (_req: Request, res: Response) => {
  archiveRecorder.start();
  res.json(archiveRecorder.getStatus());
});

router.post('/archive/stop', (_req: Request, res: Response) => {
  archiveRecorder.stop();
  res.json(archiveRecorder.getStatus());
});

router.get('/archive/chunks', (req: Request, res: Response) => {
  const windowMs = Math.min(12 * 60 * 60 * 1000, Math.max(
    60 * 1000,
    parseInt(String(req.query['window_ms'] ?? String(5 * 60 * 1000)), 10) || (5 * 60 * 1000),
  ));
  const endMs = req.query['end_ms'] !== undefined
    ? parseInt(String(req.query['end_ms']), 10) || undefined
    : undefined;
  res.json({
    ...archiveRecorder.getStatus(),
    window_ms: windowMs,
    end_ms: endMs ?? null,
    chunks: archiveRecorder.listChunks(windowMs, endMs),
  });
});

router.get('/archive/audio/:id', (req: Request, res: Response) => {
  const chunk = archiveRecorder.getChunkById(req.params.id);
  if (!chunk) {
    res.status(404).json({ error: 'Archive chunk not found' });
    return;
  }
  res.sendFile(chunk.absolute_path, {
    acceptRanges: true,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-cache',
    },
  });
});

// Stitch all chunks in [start_ms, end_ms] into one WAV. Used for both
// continuous playback of arbitrary spans and for downloading a clip
// (e.g. last 5 minutes) as a single .wav file.
// Cap the span at 30 minutes so a typo cannot OOM the server.
const MAX_RANGE_MS = 30 * 60 * 1000;
router.get('/archive/audio-range', async (req: Request, res: Response) => {
  const startMs = parseInt(String(req.query['start_ms'] ?? ''), 10);
  const endMs   = parseInt(String(req.query['end_ms']   ?? ''), 10);
  const download = String(req.query['download'] ?? '') === '1';
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    res.status(400).json({ error: 'start_ms and end_ms (end > start) are required' });
    return;
  }
  if (endMs - startMs > MAX_RANGE_MS) {
    res.status(400).json({ error: `Range too large (max ${MAX_RANGE_MS / 60000} min)` });
    return;
  }

  // Phase 6: prefer the streamed hour files when ingest has data for this
  // range — they are gapless and don't need stitching. Fall back to the
  // legacy 2 s chunks (still produced when firmware doesn't stream).
  try {
    if (audioIngest.isEnabled() && audioIngest.hasDataInRange(startMs, endMs)) {
      const got = await audioIngest.readPcmRange(startMs, endMs);
      if (got && got.pcm.length > 0) {
        sendWavBuffer(res, got.sampleRate, 1, 16, got.pcm, startMs, endMs, download);
        return;
      }
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  const chunks = archiveRecorder.getChunkFilesInRange(startMs, endMs);
  if (chunks.length === 0) {
    res.status(404).json({ error: 'No archived audio in that range' });
    return;
  }

  // Read each chunk, strip its 44-byte WAV header, keep PCM. Assume all
  // chunks share the same sample-rate / channels / bit-depth (they do —
  // the recorder uses one fixed format per session).
  try {
    let sampleRate = 0;
    let numChannels = 1;
    let bitsPerSample = 16;
    const pcmParts: Buffer[] = [];
    for (const chunk of chunks) {
      const buf = await fs.readFile(chunk.absolute_path);
      if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') continue;
      if (sampleRate === 0) {
        numChannels  = buf.readUInt16LE(22);
        sampleRate   = buf.readUInt32LE(24);
        bitsPerSample = buf.readUInt16LE(34);
      }
      const dataBytes = buf.readUInt32LE(40);
      pcmParts.push(buf.subarray(44, 44 + dataBytes));
    }
    if (sampleRate === 0 || pcmParts.length === 0) {
      res.status(500).json({ error: 'Failed to read archive chunks' });
      return;
    }
    const pcm = Buffer.concat(pcmParts);
    sendWavBuffer(res, sampleRate, numChannels, bitsPerSample, pcm, startMs, endMs, download);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

function formatTimestampForFilename(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-`
       + `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Helper: emit a single 44-byte WAV header + raw PCM buffer as the response
// body. Used by the Phase 6 ingest branch of /archive/audio-range so we don't
// duplicate header-building logic.
function sendWavBuffer(
  res: Response,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
  pcm: Buffer,
  startMs: number,
  endMs: number,
  download: boolean,
): void {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const total = header.length + pcm.length;
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Length', String(total));
  res.setHeader('Cache-Control', 'no-cache');
  if (download) {
    const fname = `esp32-${formatTimestampForFilename(startMs)}-to-${formatTimestampForFilename(endMs)}.wav`;
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  }
  res.end(Buffer.concat([header, pcm]));
}

// Historical dBFS timeline for a span, used by the dashboard to render the
// playback timeline chart (so the user can see and click loud peaks in the
// past). Capped at the same 30 min as audio-range.
router.get('/archive/db-series', async (req: Request, res: Response) => {
  const startMs = parseInt(String(req.query['start_ms'] ?? ''), 10);
  const endMs   = parseInt(String(req.query['end_ms']   ?? ''), 10);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    res.status(400).json({ error: 'start_ms and end_ms (end > start) are required' });
    return;
  }
  if (endMs - startMs > MAX_RANGE_MS) {
    res.status(400).json({ error: `Range too large (max ${MAX_RANGE_MS / 60000} min)` });
    return;
  }
  try {
    if (audioIngest.isEnabled() && audioIngest.hasDataInRange(startMs, endMs)) {
      const samples = await audioIngest.getDbSeriesInRange(startMs, endMs);
      if (samples.length > 0) {
        res.json({ start_ms: startMs, end_ms: endMs, samples, source: 'stream' });
        return;
      }
    }
    const samples = await archiveRecorder.getDbSeriesInRange(startMs, endMs);
    res.json({ start_ms: startMs, end_ms: endMs, samples, source: 'chunks' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Recent dBFS samples derived from saved archive chunks. Lets the browser
// drive its live waveform from the archive when the ESP32 is busy serving
// the next recording. `since_ms` returns only samples newer than that
// timestamp so the client can poll for deltas.
router.get('/archive/live-samples', (req: Request, res: Response) => {
  const sinceMs = req.query['since_ms'] !== undefined
    ? parseInt(String(req.query['since_ms']), 10) || undefined
    : undefined;
  const samples = archiveRecorder.getRecentLiveSamples(sinceMs);
  res.json({
    chunk_ms: archiveRecorder.getStatus().chunk_ms,
    samples,
  });
});

// Server-Sent Events stream of live dBFS samples computed from each newly
// saved archive chunk. The first message includes any recently buffered
// samples so a fresh client can populate its chart immediately.
router.get('/archive/stream', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('hello', { chunk_ms: archiveRecorder.getStatus().chunk_ms });
  // Seed with the freshest samples we have, preferring the live PCM stream
  // if it's connected; otherwise fall back to the chunk-derived ring.
  const seed = audioIngest.isEnabled() && audioIngest.getStatus().connected
    ? audioIngest.getRecentDbSamples()
    : archiveRecorder.getRecentLiveSamples();
  if (seed.length > 0) send('samples', seed);

  const onSamples = (samples: unknown) => send('samples', samples);
  const onChunk = (chunk: unknown) => send('chunk', chunk);
  archiveRecorder.on('live-samples', onSamples);
  archiveRecorder.on('chunk', onChunk);
  audioIngest.on('live-samples', onSamples);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
  _req.on('close', () => {
    clearInterval(keepAlive);
    archiveRecorder.off('live-samples', onSamples);
    archiveRecorder.off('chunk', onChunk);
    audioIngest.off('live-samples', onSamples);
    res.end();
  });
});

export default router;
