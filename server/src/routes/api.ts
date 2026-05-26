import { Router, Request, Response } from 'express';
import { config, runtimeConfig } from '../config';
import { audioIngest } from '../services/audioIngest';
import { fetchBoardInfo } from '../services/esp32Service';

const router = Router();

// ─── /api/health ─────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime_s: Math.round(process.uptime()),
    ingest: audioIngest.getStatus(),
  });
});

// ─── /api/config — ESP32 IP / port (used only for /proxy/info) ───────────────

router.get('/config', (_req: Request, res: Response) => {
  res.json({ ip: runtimeConfig.esp32Ip, port: runtimeConfig.esp32Port });
});

router.post('/config', (req: Request, res: Response) => {
  const { ip, port } = req.body as { ip?: unknown; port?: unknown };
  if (typeof ip !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    res.status(400).json({ error: 'ip must be a valid IPv4 address' });
    return;
  }
  const portNum = port !== undefined ? Number(port) : runtimeConfig.esp32Port;
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    res.status(400).json({ error: 'port must be an integer 1–65535' });
    return;
  }
  runtimeConfig.esp32Ip = ip;
  runtimeConfig.esp32Port = portNum;
  res.json({ ip: runtimeConfig.esp32Ip, port: runtimeConfig.esp32Port });
});

// ─── /api/proxy/info — board metadata from the ESP32 (HTTP) ──────────────────

function requireEsp32Config(res: Response): boolean {
  if (!runtimeConfig.esp32Ip) {
    res.status(503).json({
      error: 'ESP32 IP not configured. POST /api/config with { "ip": "x.x.x.x" }',
    });
    return false;
  }
  return true;
}

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
    res.status(503).json({ error: `ESP32 unreachable: ${(err as Error).message}` });
  }
});

// ─── /api/stream/* — TCP PCM ingest listener (the one and only audio path) ───

router.get('/stream/status', (_req: Request, res: Response) => {
  res.json(audioIngest.getStatus());
});

router.post('/stream/listener', async (req: Request, res: Response) => {
  if (!audioIngest.isEnabled()) {
    res.status(503).json({
      error: 'ingest disabled — set STREAM_INGEST_ENABLED=true and restart',
    });
    return;
  }
  const enabled = Boolean((req.body as { enabled?: unknown })?.enabled);
  if (enabled) {
    audioIngest.start();
  } else {
    await audioIngest.stop();
  }
  res.json(audioIngest.getStatus());
});

// SSE stream of live dBFS samples (200 ms cadence). Drives the dashboard
// waveform. Sends a seed batch of the most recent samples on connect.
router.get('/stream/live-samples', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('hello', { port: config.ingest.port, sample_rate: audioIngest.getStatus().sample_rate });
  const seed = audioIngest.getRecentDbSamples();
  if (seed.length > 0) send('samples', seed);

  const onSamples = (samples: unknown) => send('samples', samples);
  audioIngest.on('live-samples', onSamples);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
  _req.on('close', () => {
    clearInterval(keepAlive);
    audioIngest.off('live-samples', onSamples);
    res.end();
  });
});

export default router;