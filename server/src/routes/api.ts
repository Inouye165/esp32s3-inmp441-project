import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config, runtimeConfig } from '../config';
import { audioIngest } from '../services/audioIngest';
import { audioIngestClassic } from '../services/audioIngestClassic';
import { fetchBoardInfo } from '../services/esp32Service';
import { moduleRegistry } from '../services/moduleRegistry';
import { checkNetworkConnection } from '../services/networkChecker';

// ─── Multer setup for module image uploads ────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads');

// Ensure directory exists at module load time
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, _file, cb) => {
    const ext = path.extname(_file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.params.id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  },
});

// Only allow private (RFC 1918 + link-local) IP addresses to prevent SSRF
function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

const router = Router();

// ─── /api/health ─────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime_s: Math.round(process.uptime()),
    ingest: audioIngest.getStatus(),
  });
});

// ─── /api/network/check — Check if connected to allowed WiFi network ─────────

router.get('/network/check', async (_req: Request, res: Response) => {
  const networkInfo = await checkNetworkConnection();
  res.json(networkInfo);
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

// ─── /api/stream2/* — Unit 2 (classic ESP32) live PCM receiver ───────────────

router.get('/stream2/status', (_req: Request, res: Response) => {
  res.json(audioIngestClassic.getStatus());
});

router.post('/stream2/listener', async (req: Request, res: Response) => {
  if (!audioIngestClassic.isEnabled()) {
    res.status(503).json({
      error: 'Unit 2 ingest disabled — set STREAM_INGEST2_ENABLED=true and restart',
    });
    return;
  }
  const enabled = Boolean((req.body as { enabled?: unknown })?.enabled);
  if (enabled) {
    audioIngestClassic.start();
  } else {
    await audioIngestClassic.stop();
  }
  res.json(audioIngestClassic.getStatus());
});

// SSE live-sample stream for unit 2 waveform
router.get('/stream2/live-samples', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('hello', { port: config.ingest2.port, sample_rate: audioIngestClassic.getStatus().sample_rate });
  const seed = audioIngestClassic.getRecentDbSamples();
  if (seed.length > 0) send('samples', seed);

  const onSamples = (samples: unknown) => send('samples', samples);
  audioIngestClassic.on('live-samples', onSamples);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
  _req.on('close', () => {
    clearInterval(keepAlive);
    audioIngestClassic.off('live-samples', onSamples);
    res.end();
  });
});

// ─── /api/modules — module registry ─────────────────────────────────────────

router.get('/modules', (_req: Request, res: Response) => {
  res.json(moduleRegistry.getAll());
});

router.get('/modules/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const mod = moduleRegistry.get(id);
  if (!mod) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  res.json(mod);
});

router.put('/modules/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { ip, port, name } = req.body as { ip?: unknown; port?: unknown; name?: unknown };

  if (ip !== undefined && (typeof ip !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip as string))) {
    res.status(400).json({ error: 'ip must be a valid IPv4 address' });
    return;
  }
  if (port !== undefined) {
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      res.status(400).json({ error: 'port must be an integer 1–65535' });
      return;
    }
  }

  const updated = moduleRegistry.update(id, {
    ...(ip !== undefined ? { ip: ip as string } : {}),
    ...(port !== undefined ? { port: Number(port) } : {}),
    ...(name !== undefined && typeof name === 'string' ? { name } : {}),
  });
  if (!updated) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  res.json(updated);
});

router.post(
  '/modules/:id/image',
  upload.single('image'),
  (req: Request, res: Response) => {
    const { id } = req.params;
    // req.file is injected by multer middleware (@types/multer augments Express.Request)
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: 'no image file in request (field name: image)' });
      return;
    }
    // Use new multi-image API
    const updated = moduleRegistry.addImage(id, file.filename);
    if (!updated) {
      // Module not found — clean up the orphaned file
      fs.unlink(file.path, () => undefined);
      res.status(404).json({ error: 'module not found' });
      return;
    }
    res.json({ ok: true, images: updated.images });
  },
);

router.delete('/modules/:id/image', (req: Request, res: Response) => {
  const { id } = req.params;
  const { filename } = req.body as { filename?: string };
  if (!filename) {
    res.status(400).json({ error: 'filename required in body' });
    return;
  }
  const mod = moduleRegistry.get(id);
  if (!mod) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.unlink(filePath, () => undefined);
  const updated = moduleRegistry.removeImage(id, filename);
  res.json({ ok: true, images: updated?.images || [] });
});

// Update image rotation
router.patch('/modules/:id/image/:filename/rotation', (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const { rotation } = req.body as { rotation?: number };
  if (![0, 90, 180, 270].includes(rotation as number)) {
    res.status(400).json({ error: 'rotation must be 0, 90, 180, or 270' });
    return;
  }
  const updated = moduleRegistry.updateImageRotation(id, filename, rotation as 0 | 90 | 180 | 270);
  if (!updated) {
    res.status(404).json({ error: 'module or image not found' });
    return;
  }
  res.json({ ok: true, images: updated.images });
});

// Set default image (for module icon)
router.patch('/modules/:id/image/:filename/set-default', (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const updated = moduleRegistry.setDefaultImage(id, filename);
  if (!updated) {
    res.status(404).json({ error: 'module or image not found' });
    return;
  }
  res.json({ ok: true, images: updated.images });
});

// Update module pinout
router.patch('/modules/:id/pinout', (req: Request, res: Response) => {
  const { id } = req.params;
  const { pinout } = req.body as { pinout?: unknown };
  
  // Basic validation
  if (!pinout || typeof pinout !== 'object') {
    res.status(400).json({ error: 'pinout object required' });
    return;
  }
  
  const p = pinout as { leftPins?: unknown[]; rightPins?: unknown[] };
  if (!Array.isArray(p.leftPins) || !Array.isArray(p.rightPins)) {
    res.status(400).json({ error: 'pinout must have leftPins and rightPins arrays' });
    return;
  }
  
  // Validate pin structure
  const validatePin = (pin: unknown): boolean => {
    if (!pin || typeof pin !== 'object') return false;
    const p = pin as { label?: unknown; gpio?: unknown; notes?: unknown; type?: unknown };
    return (
      typeof p.label === 'string' &&
      typeof p.gpio === 'string' &&
      typeof p.notes === 'string' &&
      ['gpio', 'power', 'ground'].includes(p.type as string)
    );
  };
  
  if (!p.leftPins.every(validatePin) || !p.rightPins.every(validatePin)) {
    res.status(400).json({ error: 'invalid pin structure' });
    return;
  }
  
  const updated = moduleRegistry.updatePinout(id, p as { leftPins: unknown[]; rightPins: unknown[] } as any);
  if (!updated) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  res.json({ ok: true, pinout: updated.pinout });
});

// ─── /api/modules/:id/parts — update parts/components ────────────────────────

router.patch('/modules/:id/parts', (req: Request, res: Response) => {
  const { id } = req.params;
  const { parts } = req.body as { parts?: unknown };
  
  // Basic validation
  if (!parts || !Array.isArray(parts)) {
    res.status(400).json({ error: 'parts array required' });
    return;
  }
  
  // Validate part structure
  const validatePart = (part: unknown): boolean => {
    if (!part || typeof part !== 'object') return false;
    const p = part as { 
      name?: unknown; 
      type?: unknown; 
      manufacturer?: unknown; 
      model?: unknown; 
      quantity?: unknown;
      description?: unknown;
      datasheet?: unknown;
      notes?: unknown;
    };
    return (
      typeof p.name === 'string' &&
      (p.type === undefined || typeof p.type === 'string') &&
      (p.manufacturer === undefined || typeof p.manufacturer === 'string') &&
      (p.model === undefined || typeof p.model === 'string') &&
      (p.quantity === undefined || typeof p.quantity === 'number') &&
      (p.description === undefined || typeof p.description === 'string') &&
      (p.datasheet === undefined || typeof p.datasheet === 'string') &&
      (p.notes === undefined || typeof p.notes === 'string')
    );
  };
  
  if (!parts.every(validatePart)) {
    res.status(400).json({ error: 'invalid part structure' });
    return;
  }
  
  const mod = moduleRegistry.get(id);
  if (!mod) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  
  (mod as any).parts = parts;
  res.json({ ok: true, parts: (mod as any).parts });
});

// ─── /api/modules/:id/notes — update notes ───────────────────────────────────

router.patch('/modules/:id/notes', (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body as { notes?: unknown };
  
  // Basic validation
  if (!notes || typeof notes !== 'object') {
    res.status(400).json({ error: 'notes object required' });
    return;
  }
  
  const n = notes as {
    links?: unknown;
    purchaseDate?: unknown;
    quantity?: unknown;
    projects?: unknown;
    generalNotes?: unknown;
  };
  
  // Validate structure
  const validateLink = (link: unknown): boolean => {
    if (!link || typeof link !== 'object') return false;
    const l = link as { title?: unknown; url?: unknown };
    return (
      (l.title === undefined || typeof l.title === 'string') &&
      (l.url === undefined || typeof l.url === 'string')
    );
  };
  
  if (n.links !== undefined && (!Array.isArray(n.links) || !n.links.every(validateLink))) {
    res.status(400).json({ error: 'invalid links structure' });
    return;
  }
  
  if (n.purchaseDate !== undefined && typeof n.purchaseDate !== 'string') {
    res.status(400).json({ error: 'purchaseDate must be a string' });
    return;
  }
  
  if (n.quantity !== undefined && typeof n.quantity !== 'number') {
    res.status(400).json({ error: 'quantity must be a number' });
    return;
  }
  
  if (n.projects !== undefined && (!Array.isArray(n.projects) || !n.projects.every(p => typeof p === 'string'))) {
    res.status(400).json({ error: 'projects must be an array of strings' });
    return;
  }
  
  if (n.generalNotes !== undefined && typeof n.generalNotes !== 'string') {
    res.status(400).json({ error: 'generalNotes must be a string' });
    return;
  }
  
  const mod = moduleRegistry.get(id);
  if (!mod) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  
  (mod as any).notes = notes;
  res.json({ ok: true, notes: (mod as any).notes });
});

// ─── /api/modules/:id/led/:command — proxy LED command to device ─────────────

router.post('/modules/:id/led/:command', async (req: Request, res: Response) => {
  const { id, command } = req.params;
  const allowedCmds = ['on', 'off', 'blink'];
  if (!allowedCmds.includes(command)) {
    res.status(400).json({ error: 'command must be on, off, or blink' });
    return;
  }

  const mod = moduleRegistry.get(id);
  if (!mod) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  if (!mod.hasLed) {
    res.status(400).json({ error: 'this module has no LED control' });
    return;
  }
  if (!mod.ip) {
    res.status(503).json({ error: 'device IP not configured — save an IP first' });
    return;
  }
  if (!isPrivateIp(mod.ip)) {
    res.status(403).json({ error: 'device IP must be a private/local address' });
    return;
  }

  try {
    const url = `http://${mod.ip}:${mod.port}/led/${command}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    res.json({ ok: response.ok, command, module: id });
  } catch (err) {
    res.status(503).json({ error: `Device unreachable: ${(err as Error).message}` });
  }
});

export default router;