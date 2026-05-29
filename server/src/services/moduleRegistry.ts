import fs from 'fs';
import path from 'path';

export interface ModuleImage {
  filename: string;
  rotation: 0 | 90 | 180 | 270;
  isDefault?: boolean;  // Mark primary image for module icon
}

export interface PinoutPin {
  label: string;
  gpio: string;
  notes: string;
  type: 'gpio' | 'power' | 'ground';
}

export interface ModulePinout {
  leftPins: PinoutPin[];
  rightPins: PinoutPin[];
}

export interface ModuleEntry {
  id: string;
  name: string;
  type: string;
  ip: string;
  port: number;
  hasLed: boolean;
  imageFile?: string;  // Legacy single image (backward compat)
  images?: ModuleImage[];  // New multi-image support
  pinout?: ModulePinout;  // GPIO pinout data
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MODULES_FILE = path.join(DATA_DIR, 'modules.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 10;  // Keep last 10 backups

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
      const modules = JSON.parse(fs.readFileSync(MODULES_FILE, 'utf-8')) as ModuleEntry[];
      
      // Migration: convert old imageFile to new images array
      let migrated = false;
      modules.forEach(m => {
        if (m.imageFile && !m.images) {
          m.images = [{ filename: m.imageFile, rotation: 0 }];
          delete m.imageFile;
          migrated = true;
        }
      });
      
      if (migrated) {
        this.writeFile(modules);
        console.log('[ModuleRegistry] Migrated legacy imageFile to images array');
      }
      
      return modules;
    } catch {
      return DEFAULT_MODULES.map(m => ({ ...m }));
    }
  }

  private createBackup(): void {
    try {
      // Only backup if the file exists
      if (!fs.existsSync(MODULES_FILE)) return;
      
      // Create backup directory if needed
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      
      // Create timestamped backup filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupFile = path.join(BACKUP_DIR, `modules-${timestamp}.json`);
      
      // Copy current file to backup
      fs.copyFileSync(MODULES_FILE, backupFile);
      console.log(`[ModuleRegistry] Backup created: ${path.basename(backupFile)}`);
      
      // Clean up old backups (keep only MAX_BACKUPS most recent)
      this.cleanupOldBackups();
    } catch (err) {
      console.error('[ModuleRegistry] Failed to create backup:', err);
    }
  }

  private cleanupOldBackups(): void {
    try {
      if (!fs.existsSync(BACKUP_DIR)) return;
      
      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('modules-') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(BACKUP_DIR, f),
          time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);  // Sort newest first
      
      // Delete backups beyond MAX_BACKUPS
      if (backups.length > MAX_BACKUPS) {
        backups.slice(MAX_BACKUPS).forEach(backup => {
          fs.unlinkSync(backup.path);
          console.log(`[ModuleRegistry] Deleted old backup: ${backup.name}`);
        });
      }
    } catch (err) {
      console.error('[ModuleRegistry] Failed to cleanup old backups:', err);
    }
  }

  private writeFile(modules: ModuleEntry[]): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      
      // Create backup before writing (if file exists)
      if (fs.existsSync(MODULES_FILE)) {
        this.createBackup();
      }
      
      fs.writeFileSync(MODULES_FILE, JSON.stringify(modules, null, 2), 'utf-8');
      console.log('[ModuleRegistry] Data saved successfully');
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

  // Public save method for external updates
  save(): void {
    this.writeFile(this.modules);
  }

  // List available backups
  listBackups(): { name: string; date: Date; size: number }[] {
    try {
      if (!fs.existsSync(BACKUP_DIR)) return [];
      
      return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('modules-') && f.endsWith('.json'))
        .map(f => {
          const fullPath = path.join(BACKUP_DIR, f);
          const stats = fs.statSync(fullPath);
          return {
            name: f,
            date: stats.mtime,
            size: stats.size
          };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (err) {
      console.error('[ModuleRegistry] Failed to list backups:', err);
      return [];
    }
  }

  // Restore from a backup
  restoreBackup(backupName: string): boolean {
    try {
      const backupPath = path.join(BACKUP_DIR, backupName);
      if (!fs.existsSync(backupPath)) {
        console.error(`[ModuleRegistry] Backup not found: ${backupName}`);
        return false;
      }
      
      // Create a backup of current state before restoring
      if (fs.existsSync(MODULES_FILE)) {
        const emergencyBackup = path.join(BACKUP_DIR, `modules-pre-restore-${Date.now()}.json`);
        fs.copyFileSync(MODULES_FILE, emergencyBackup);
        console.log('[ModuleRegistry] Created emergency backup before restore');
      }
      
      // Restore the backup
      fs.copyFileSync(backupPath, MODULES_FILE);
      this.modules = this.load();
      console.log(`[ModuleRegistry] Restored from backup: ${backupName}`);
      return true;
    } catch (err) {
      console.error('[ModuleRegistry] Failed to restore backup:', err);
      return false;
    }
  }

  // Multi-image support
  addImage(id: string, filename: string): ModuleEntry | undefined {
    const m = this.modules.find(m => m.id === id);
    if (!m) return undefined;
    if (!m.images) m.images = [];
    // If this is the first image, mark it as default
    const isFirstImage = m.images.length === 0;
    m.images.push({ filename, rotation: 0, isDefault: isFirstImage });
    this.writeFile(this.modules);
    return { ...m };
  }

  removeImage(id: string, filename: string): ModuleEntry | undefined {
    const m = this.modules.find(m => m.id === id);
    if (!m || !m.images) return undefined;
    const removedImage = m.images.find(img => img.filename === filename);
    m.images = m.images.filter(img => img.filename !== filename);
    // If we removed the default image and others exist, make the first one default
    if (removedImage?.isDefault && m.images.length > 0) {
      m.images[0].isDefault = true;
    }
    this.writeFile(this.modules);
    return { ...m };
  }

  updateImageRotation(id: string, filename: string, rotation: 0 | 90 | 180 | 270): ModuleEntry | undefined {
    const m = this.modules.find(m => m.id === id);
    if (!m || !m.images) return undefined;
    const img = m.images.find(i => i.filename === filename);
    if (!img) return undefined;
    img.rotation = rotation;
    this.writeFile(this.modules);
    return { ...m };
  }

  setDefaultImage(id: string, filename: string): ModuleEntry | undefined {
    const m = this.modules.find(m => m.id === id);
    if (!m || !m.images) return undefined;
    const targetImage = m.images.find(i => i.filename === filename);
    if (!targetImage) return undefined;
    // Unmark all images as default
    m.images.forEach(img => { img.isDefault = false; });
    // Mark the target image as default
    targetImage.isDefault = true;
    this.writeFile(this.modules);
    return { ...m };
  }

  updatePinout(id: string, pinout: ModulePinout): ModuleEntry | undefined {
    const m = this.modules.find(m => m.id === id);
    if (!m) return undefined;
    m.pinout = pinout;
    this.writeFile(this.modules);
    return { ...m };
  }
}

export const moduleRegistry = new ModuleRegistry();
