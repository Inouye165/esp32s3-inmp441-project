import { moduleRegistry } from '../src/services/moduleRegistry';

// Note: This test file focuses on read-only operations with the moduleRegistry singleton.
// Mutation operations (update, addImage, removeImage, etc.) are comprehensively tested
// in moduleApi.test.ts which tests the actual API endpoints.

describe('ModuleRegistry - Read Operations', () => {
  describe('getAll', () => {
    it('returns all modules', () => {
      const modules = moduleRegistry.getAll();
      
      expect(modules.length).toBeGreaterThan(0);
      expect(Array.isArray(modules)).toBe(true);
    });

    it('returns modules with required properties', () => {
      const modules = moduleRegistry.getAll();
      const module = modules[0];
      
      expect(module).toHaveProperty('id');
      expect(module).toHaveProperty('name');
      expect(module).toHaveProperty('type');
      expect(module).toHaveProperty('ip');
      expect(module).toHaveProperty('port');
      expect(module).toHaveProperty('hasLed');
    });

    it('returns default modules on first load', () => {
      const modules = moduleRegistry.getAll();
      const moduleIds = modules.map(m => m.id);
      
      // Should include default modules (check partial match since IDs may have suffixes)
      expect(moduleIds.some(id => id.startsWith('esp8266'))).toBe(true);
      expect(moduleIds.some(id => id.startsWith('esp32s3'))).toBe(true);
      expect(moduleIds.some(id => id.startsWith('esp32classic'))).toBe(true);
    });
  });

  describe('get', () => {
    it('returns a module by id', () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      const module = moduleRegistry.get(moduleId);
      
      expect(module).toBeDefined();
      expect(module?.id).toBe(moduleId);
    });

    it('returns undefined for non-existent module', () => {
      const module = moduleRegistry.get('nonexistent-id-xyz-12345');
      
      expect(module).toBeUndefined();
    });

    it('returns complete module object', () => {
      // Use the first available module instead of hardcoding ID
      const modules = moduleRegistry.getAll();
      const module = moduleRegistry.get(modules[0].id);
      
      expect(module).toBeDefined();
      expect(module?.name).toBeDefined();
      expect(module?.type).toBeDefined();
      expect(typeof module?.port).toBe('number');
      expect(typeof module?.hasLed).toBe('boolean');
    });
  });

  describe('module structure validation', () => {
    it('all modules have valid IP format or empty string', () => {
      const modules = moduleRegistry.getAll();
      
      modules.forEach(module => {
        if (module.ip) {
          // Validate IP format if not empty
          expect(module.ip).toMatch(/^(\d{1,3}\.){3}\d{1,3}$/);
        } else {
          expect(module.ip).toBe('');
        }
      });
    });

    it('all modules have valid port numbers', () => {
      const modules = moduleRegistry.getAll();
      
      modules.forEach(module => {
        expect(module.port).toBeGreaterThan(0);
        expect(module.port).toBeLessThanOrEqual(65535);
        expect(Number.isInteger(module.port)).toBe(true);
      });
    });

    it('all modules have unique IDs', () => {
      const modules = moduleRegistry.getAll();
      const ids = modules.map(m => m.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});

