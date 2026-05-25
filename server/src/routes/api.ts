import { Router, Request, Response } from 'express';
import { config, runtimeConfig } from '../config';
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

router.get('/proxy/info', async (_req: Request, res: Response) => {
  if (!requireEsp32Config(res)) return;
  try {
    const info = await fetchBoardInfo(runtimeConfig.esp32Ip, runtimeConfig.esp32Port);
    res.json(info);
  } catch (err) {
    res.status(502).json({ error: `Cannot reach ESP32: ${(err as Error).message}` });
  }
});

// ─── GET /api/proxy/audio/level — proxy live audio level from ESP32 ──────────

router.get('/proxy/audio/level', async (_req: Request, res: Response) => {
  if (!requireEsp32Config(res)) return;
  try {
    const level = await fetchAudioLevel(runtimeConfig.esp32Ip, runtimeConfig.esp32Port);
    res.json(level);
  } catch (err) {
    res.status(502).json({ error: `Cannot reach ESP32: ${(err as Error).message}` });
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

export default router;
