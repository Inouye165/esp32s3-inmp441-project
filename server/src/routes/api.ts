import { Router, Request, Response } from 'express';
import { runtimeConfig } from '../config';
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

export default router;
