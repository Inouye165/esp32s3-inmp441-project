import fs from 'fs';
import path from 'path';

export interface ModuleEntry {
  id: string;
  name: string;
  type: string;
  ip: string;
  port: number;
  hasLed: boolean;
  imageFile?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MODULES_FILE = path.join(DATA_DIR, 'modules.json');

const DEFAULT_MODULES: ModuleEntry[] = [
  {
    id: 'esp8266',
    name: 'ESP8266 NodeMCU',
    type: 'ESP8266 NodeMCU v2 (ESP-12E)',
    ip: '172.20.10.2',
    port: 80,
    hasLed: true,
  },
  {
    id: 'esp32s3',
    name: 'ESP32-S3 Unit 1',
    type: 'ESP32-S3-WROOM-1',
    ip: '',
    port: 80,
    hasLed: false,
  },
  {
    id: 'esp32classic',
    name: 'ESP32 Classic Unit 2',
    type: 'ESP32-D0WD DevKit V1',
    ip: '',
    port: 80,
    hasLed: false,
  },
];

class ModuleRegistry {
  private modules: ModuleEntry[];

  constructor() {
    this.modules = this.load();
  }

  private load(): ModuleEntry[] {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(MODULES_FILE)) {
        const seed = DEFAULT_MODULES.map(m => ({ ...m }));
        this.writeFile(seed);
        return seed;
      }
      return JSON.parse(fs.readFileSync(MODULES_FILE, 'utf-8')) as ModuleEntry[];
    } catch {
      return DEFAULT_MODULES.map(m => ({ ...m }));
    }
  }

  private writeFile(modules: ModuleEntry[]): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(MODULES_FILE, JSON.stringify(modules, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ModuleRegistry] Failed to persist:', err);
    }
  }

  getAll(): ModuleEntry[] {
    return this.modules;
  }

  get(id: string): ModuleEntry | undefined {
    return this.modules.find(m => m.id === id);
  }

  update(
    id: string,
    patch: Partial<Pick<ModuleEntry, 'name' | 'ip' | 'port'>>,
  ): ModuleEntry | undefined {
    const m = this.modules.find(m => m.id === id);
    if (!m) return undefined;
    if (patch.name !== undefined) m.name = patch.name;
    if (patch.ip !== undefined) m.ip = patch.ip;
    if (patch.port !== undefined) m.port = patch.port;
    this.writeFile(this.modules);
    return { ...m };
  }

  setImage(id: string, filename: string): ModuleEntry | undefined {
    const m = this.modules.find(m => m.id === id);
    if (!m) return undefined;
    m.imageFile = filename;
    this.writeFile(this.modules);
    return { ...m };
  }

  clearImage(id: string): boolean {
    const m = this.modules.find(m => m.id === id);
    if (!m) return false;
    delete m.imageFile;
    this.writeFile(this.modules);
    return true;
  }
}

export const moduleRegistry = new ModuleRegistry();
