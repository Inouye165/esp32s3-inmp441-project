import request from 'supertest';
import { createApp } from '../src/app';
import * as networkChecker from '../src/services/networkChecker';

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

describe('IP Address Validation and SSRF Protection', () => {
  describe('Valid Private IP Addresses', () => {
    it('accepts 10.0.0.0/8 range', async () => {
      const validIPs = [
        '10.0.0.0',
        '10.0.0.1',
        '10.128.0.1',
        '10.255.255.254',
        '10.255.255.255',
      ];

      for (const ip of validIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(200);
        expect(res.body.ip).toBe(ip);
      }
    });

    it('accepts 172.16.0.0/12 range', async () => {
      const validIPs = [
        '172.16.0.0',
        '172.16.0.1',
        '172.20.10.5',
        '172.31.255.254',
        '172.31.255.255',
      ];

      for (const ip of validIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(200);
        expect(res.body.ip).toBe(ip);
      }
    });

    it('accepts 192.168.0.0/16 range', async () => {
      const validIPs = [
        '192.168.0.0',
        '192.168.0.1',
        '192.168.1.100',
        '192.168.255.254',
        '192.168.255.255',
      ];

      for (const ip of validIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(200);
        expect(res.body.ip).toBe(ip);
      }
    });

    it('accepts localhost 127.0.0.0/8', async () => {
      const validIPs = [
        '127.0.0.0',
        '127.0.0.1',
        '127.1.1.1',
        '127.255.255.255',
      ];

      for (const ip of validIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(200);
        expect(res.body.ip).toBe(ip);
      }
    });

    it('accepts link-local 169.254.0.0/16', async () => {
      const validIPs = [
        '169.254.0.0',
        '169.254.1.1',
        '169.254.169.254',  // AWS metadata service
        '169.254.255.255',
      ];

      for (const ip of validIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(200);
        expect(res.body.ip).toBe(ip);
      }
    });
  });

  describe('Invalid IP Address Formats', () => {
    it('rejects non-IP strings', async () => {
      const invalidIPs = [
        'not-an-ip',
        'example.com',
        'localhost',
        'abc.def.ghi.jkl',
      ];

      for (const ip of invalidIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/valid IPv4 address/);
      }
    });

    it('rejects IP with too many octets', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '192.168.1.1.1' });

      expect(res.status).toBe(400);
    });

    it('rejects IP with too few octets', async () => {
      const invalidIPs = ['192', '192.168', '192.168.1'];

      for (const ip of invalidIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(400);
      }
    });

    it('rejects empty string', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '' });

      expect(res.status).toBe(400);
    });

    it('rejects null', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: null });

      expect(res.status).toBe(400);
    });

    it('rejects undefined (missing ip field)', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('IP Address Boundary Tests', () => {
    it('accepts valid boundary IPs', async () => {
      const boundaryIPs = [
        '0.0.0.0',
        '10.0.0.0',
        '10.255.255.255',
        '172.16.0.0',
        '192.168.0.0',
      ];

      for (const ip of boundaryIPs) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip });

        expect(res.status).toBe(200);
      }
    });

    it('rejects IP with negative numbers', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '-1.0.0.1' });

      expect(res.status).toBe(400);
    });
  });

  describe('Edge Cases for 172.x.x.x range', () => {
    it('accepts 172.16.0.0 (start of range)', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '172.16.0.0' });

      expect(res.status).toBe(200);
    });

    it('accepts 172.31.255.255 (end of range)', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '172.31.255.255' });

      expect(res.status).toBe(200);
    });

    it('accepts 172.20.10.5 (middle of range)', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '172.20.10.5' });

      expect(res.status).toBe(200);
    });
  });

  describe('Port Validation', () => {
    it('accepts valid port numbers', async () => {
      const validPorts = [1, 80, 443, 8080, 65535];

      for (const port of validPorts) {
        const res = await request(app)
          .post('/api/config')
          .send({ ip: '192.168.1.1', port });

        expect(res.status).toBe(200);
        expect(res.body.port).toBe(port);
      }
    });

    it('rejects port 0', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '192.168.1.1', port: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1–65535/);
    });

    it('rejects negative port', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '192.168.1.1', port: -1 });

      expect(res.status).toBe(400);
    });

    it('rejects port > 65535', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '192.168.1.1', port: 65536 });

      expect(res.status).toBe(400);
    });

    it('rejects non-integer port', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '192.168.1.1', port: 80.5 });

      expect(res.status).toBe(400);
    });

    it('rejects string port', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: '192.168.1.1', port: 'eighty' });

      expect(res.status).toBe(400);
    });
  });
});

describe('Error Handler Middleware', () => {
  describe('404 for unknown API routes', () => {
    it('returns 404 for non-existent API endpoint', async () => {
      const res = await request(app).get('/api/nonexistent-endpoint');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 404 for deeply nested non-existent routes', async () => {
      const res = await request(app).get('/api/fake/nested/route');

      expect(res.status).toBe(404);
    });
  });

  describe('Error responses have consistent format', () => {
    it('error responses include error field', async () => {
      const res = await request(app)
        .post('/api/config')
        .send({ ip: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error).toBe('string');
    });
  });
});
