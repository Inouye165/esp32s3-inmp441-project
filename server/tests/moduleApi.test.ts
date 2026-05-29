import request from 'supertest';
import { createApp } from '../src/app';
import { moduleRegistry } from '../src/services/moduleRegistry';
import * as networkChecker from '../src/services/networkChecker';
import fs from 'fs';
import path from 'path';

const app = createApp();

// Mock network checker to allow all requests
jest.mock('../src/services/networkChecker');

beforeAll(() => {
  jest.spyOn(networkChecker, 'checkNetworkConnection').mockResolvedValue({
    connected: true,
    networkName: 'Dobby',
    isAllowed: true,
    allowedNetworks: ['Dobby'],
  });
});

describe('Module API Endpoints', () => {
  describe('GET /api/modules', () => {
    it('returns all modules', async () => {
      const res = await request(app).get('/api/modules');
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('returns modules with required fields', async () => {
      const res = await request(app).get('/api/modules');
      
      const module = res.body[0];
      expect(module).toHaveProperty('id');
      expect(module).toHaveProperty('name');
      expect(module).toHaveProperty('type');
      expect(module).toHaveProperty('ip');
      expect(module).toHaveProperty('port');
      expect(module).toHaveProperty('hasLed');
    });
  });

  describe('GET /api/modules/:id', () => {
    it('returns a specific module', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const res = await request(app).get(`/api/modules/${moduleId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(moduleId);
    });

    it('returns 404 for non-existent module', async () => {
      const res = await request(app).get('/api/modules/nonexistent');
      
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/modules/:id', () => {
    let testModuleId: string;
    let originalModule: any;

    beforeEach(() => {
      const modules = moduleRegistry.getAll();
      testModuleId = modules[0].id;
      originalModule = { ...modules[0] };
    });

    afterEach(() => {
      // Restore original module state
      if (originalModule) {
        moduleRegistry.update(testModuleId, {
          name: originalModule.name,
          ip: originalModule.ip,
          port: originalModule.port,
        });
      }
    });

    it('updates module name', async () => {
      const res = await request(app)
        .put(`/api/modules/${testModuleId}`)
        .send({ name: 'Updated Module Name' });
      
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Module Name');
    });

    it('updates module IP', async () => {
      const res = await request(app)
        .put(`/api/modules/${testModuleId}`)
        .send({ ip: '192.168.100.50' });
      
      expect(res.status).toBe(200);
      expect(res.body.ip).toBe('192.168.100.50');
    });

    it('updates module port', async () => {
      const res = await request(app)
        .put(`/api/modules/${testModuleId}`)
        .send({ port: 8080 });
      
      expect(res.status).toBe(200);
      expect(res.body.port).toBe(8080);
    });

    it('validates IP address format', async () => {
      const res = await request(app)
        .put(`/api/modules/${testModuleId}`)
        .send({ ip: 'not-an-ip' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid IPv4 address/);
    });

    it('validates port range', async () => {
      const res = await request(app)
        .put(`/api/modules/${testModuleId}`)
        .send({ port: 99999 });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1–65535/);
    });

    it('rejects negative port numbers', async () => {
      const res = await request(app)
        .put(`/api/modules/${testModuleId}`)
        .send({ port: -1 });
      
      expect(res.status).toBe(400);
    });

    it('rejects port 0', async () => {
      const res = await request(app)
        .put(`/api/modules/${testModuleId}`)
        .send({ port: 0 });
      
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent module', async () => {
      const res = await request(app)
        .put('/api/modules/nonexistent')
        .send({ name: 'Test' });
      
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/modules/:id/pinout', () => {
    const validPinout = {
      leftPins: [
        { label: 'GPIO1', gpio: '1', notes: 'TX', type: 'gpio' },
        { label: '3.3V', gpio: '', notes: 'Power', type: 'power' },
      ],
      rightPins: [
        { label: 'GND', gpio: '', notes: 'Ground', type: 'ground' },
        { label: 'GPIO2', gpio: '2', notes: 'RX', type: 'gpio' },
      ],
    };

    it('updates module pinout', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const res = await request(app)
        .patch(`/api/modules/${moduleId}/pinout`)
        .send({ pinout: validPinout });
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.pinout).toEqual(validPinout);
    });

    it('validates pinout structure', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const res = await request(app)
        .patch(`/api/modules/${moduleId}/pinout`)
        .send({ pinout: { invalid: 'structure' } });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/leftPins and rightPins arrays/);
    });

    it('validates pin fields', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const invalidPinout = {
        leftPins: [
          { label: 'GPIO1', gpio: 1, notes: 'TX', type: 'gpio' }, // gpio should be string
        ],
        rightPins: [],
      };
      
      const res = await request(app)
        .patch(`/api/modules/${moduleId}/pinout`)
        .send({ pinout: invalidPinout });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid pin structure/);
    });

    it('validates pin type values', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const invalidPinout = {
        leftPins: [
          { label: 'GPIO1', gpio: '1', notes: 'TX', type: 'invalid' },
        ],
        rightPins: [],
      };
      
      const res = await request(app)
        .patch(`/api/modules/${moduleId}/pinout`)
        .send({ pinout: invalidPinout });
      
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent module', async () => {
      const res = await request(app)
        .patch('/api/modules/nonexistent/pinout')
        .send({ pinout: validPinout });
      
      expect(res.status).toBe(404);
    });
  });

  describe('Image Management', () => {
    let testModuleId: string;
    
    beforeEach(() => {
      const modules = moduleRegistry.getAll();
      testModuleId = modules[0].id;
      // Clean up any existing images
      const module = moduleRegistry.get(testModuleId);
      if (module && module.images) {
        for (const img of [...module.images]) {
          moduleRegistry.removeImage(testModuleId, img.filename);
        }
      }
    });

    describe('PATCH /api/modules/:id/image/:filename/rotation', () => {
      it('updates image rotation to 90 degrees', async () => {
        // Add an image first
        moduleRegistry.addImage(testModuleId, 'test-image.jpg');
        
        const res = await request(app)
          .patch(`/api/modules/${testModuleId}/image/test-image.jpg/rotation`)
          .send({ rotation: 90 });
        
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        // Find the specific image we updated
        const updatedImage = res.body.images.find((img: any) => img.filename === 'test-image.jpg');
        expect(updatedImage.rotation).toBe(90);
      });

      it('accepts all valid rotation values', async () => {
        moduleRegistry.addImage(testModuleId, 'test-rotation.jpg');
        
        for (const rotation of [0, 90, 180, 270]) {
          const res = await request(app)
            .patch(`/api/modules/${testModuleId}/image/test-rotation.jpg/rotation`)
            .send({ rotation });
          
          expect(res.status).toBe(200);
          const updatedImage = res.body.images.find((img: any) => img.filename === 'test-rotation.jpg');
          expect(updatedImage.rotation).toBe(rotation);
        }
      });

      it('rejects invalid rotation values', async () => {
        const res = await request(app)
          .patch(`/api/modules/${testModuleId}/image/test.jpg/rotation`)
          .send({ rotation: 45 });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/0, 90, 180, or 270/);
      });

      it('returns 404 for non-existent module', async () => {
        const res = await request(app)
          .patch('/api/modules/nonexistent/image/test.jpg/rotation')
          .send({ rotation: 90 });
        
        expect(res.status).toBe(404);
      });
    });

    describe('PATCH /api/modules/:id/image/:filename/set-default', () => {
      it('sets an image as default', async () => {
        const modules = moduleRegistry.getAll();
        const moduleId = modules[0].id;
        
        moduleRegistry.addImage(moduleId, 'image1.jpg');
        moduleRegistry.addImage(moduleId, 'image2.jpg');
        
        const res = await request(app)
          .patch(`/api/modules/${moduleId}/image/image2.jpg/set-default`);
        
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        
        const defaultImage = res.body.images.find((img: any) => img.isDefault);
        expect(defaultImage.filename).toBe('image2.jpg');
      });

      it('returns 404 for non-existent module', async () => {
        const res = await request(app)
          .patch('/api/modules/nonexistent/image/test.jpg/set-default');
        
        expect(res.status).toBe(404);
      });

      it('returns 404 for non-existent image', async () => {
        const modules = moduleRegistry.getAll();
        const moduleId = modules[0].id;
        
        const res = await request(app)
          .patch(`/api/modules/${moduleId}/image/nonexistent.jpg/set-default`);
        
        expect(res.status).toBe(404);
      });
    });

    describe('DELETE /api/modules/:id/image', () => {
      it('removes an image from module', async () => {
        const modules = moduleRegistry.getAll();
        const moduleId = modules[0].id;
        
        moduleRegistry.addImage(moduleId, 'to-delete.jpg');
        
        const res = await request(app)
          .delete(`/api/modules/${moduleId}/image`)
          .send({ filename: 'to-delete.jpg' });
        
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      });

      it('requires filename in body', async () => {
        const modules = moduleRegistry.getAll();
        const moduleId = modules[0].id;
        
        const res = await request(app)
          .delete(`/api/modules/${moduleId}/image`)
          .send({});
        
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/filename required/);
      });

      it('returns 404 for non-existent module', async () => {
        const res = await request(app)
          .delete('/api/modules/nonexistent/image')
          .send({ filename: 'test.jpg' });
        
        expect(res.status).toBe(404);
      });
    });
  });

  describe('IP Address Validation (SSRF Protection)', () => {
    it('allows private IP addresses (RFC 1918)', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const privateIPs = [
        '10.0.0.1',
        '10.255.255.254',
        '172.16.0.1',
        '172.31.255.254',
        '192.168.0.1',
        '192.168.255.254',
      ];
      
      for (const ip of privateIPs) {
        const res = await request(app)
          .put(`/api/modules/${moduleId}`)
          .send({ ip });
        
        expect(res.status).toBe(200);
        expect(res.body.ip).toBe(ip);
      }
    });

    it('allows localhost addresses', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const res = await request(app)
        .put(`/api/modules/${moduleId}`)
        .send({ ip: '127.0.0.1' });
      
      expect(res.status).toBe(200);
    });

    it('allows link-local addresses', async () => {
      const modules = moduleRegistry.getAll();
      const moduleId = modules[0].id;
      
      const res = await request(app)
        .put(`/api/modules/${moduleId}`)
        .send({ ip: '169.254.1.1' });
      
      expect(res.status).toBe(200);
    });
  });
});
