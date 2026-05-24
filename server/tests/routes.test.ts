import request from 'supertest';
import { createApp } from '../src/app';
import { runtimeConfig } from '../src/config';
import * as esp32Service from '../src/services/esp32Service';

const app = createApp();

// Reset runtime config before each test
beforeEach(() => {
  runtimeConfig.esp32Ip = '';
  runtimeConfig.esp32Port = 80;
});

describe('GET /api/config', () => {
  it('returns current config', async () => {
    runtimeConfig.esp32Ip = '10.0.0.1';
    runtimeConfig.esp32Port = 80;
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ip: '10.0.0.1', port: 80 });
  });
});

describe('POST /api/config', () => {
  it('sets a valid IP and returns it', async () => {
    const res = await request(app)
      .post('/api/config')
      .send({ ip: '192.168.1.100' });
    expect(res.status).toBe(200);
    expect(res.body.ip).toBe('192.168.1.100');
    expect(runtimeConfig.esp32Ip).toBe('192.168.1.100');
  });

  it('rejects an invalid IP address', async () => {
    const res = await request(app)
      .post('/api/config')
      .send({ ip: 'not-an-ip' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects a port out of range', async () => {
    const res = await request(app)
      .post('/api/config')
      .send({ ip: '192.168.1.1', port: 99999 });
    expect(res.status).toBe(400);
  });

  it('accepts a custom port', async () => {
    const res = await request(app)
      .post('/api/config')
      .send({ ip: '192.168.1.1', port: 8080 });
    expect(res.status).toBe(200);
    expect(res.body.port).toBe(8080);
  });
});

describe('GET /api/proxy/info (no ESP32 configured)', () => {
  it('returns 503 when ESP32 IP is not set', async () => {
    const res = await request(app).get('/api/proxy/info');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });
});

describe('GET /api/proxy/audio/level (no ESP32 configured)', () => {
  it('returns 503 when ESP32 IP is not set', async () => {
    const res = await request(app).get('/api/proxy/audio/level');
    expect(res.status).toBe(503);
  });
});

describe('GET /api/proxy/info (ESP32 configured, service mocked)', () => {
  const mockBoard = {
    firmware_version: '1.0.0', board: 'ESP32-S3-DevKitC-1',
    chip_model: 'ESP32-S3', chip_revision: 0, chip_cores: 2,
    flash_size_bytes: 8388608, psram_size_bytes: 0, free_heap_bytes: 300000,
    sdk_version: 'v5.1.0', mac: 'AA:BB:CC:DD:EE:FF',
    ip: '192.168.1.50', ssid: 'Dobby', rssi_dbm: -65, uptime_ms: 60000,
    microphone: {
      type: 'INMP441', interface: 'I2S', sample_rate: 44100, bits: 32,
      channel: 'Left', pins: { sck: 14, ws: 15, sd: 32, lr: 'GND', vdd: '3.3V' },
    },
  };

  it('returns 200 with board info from ESP32', async () => {
    runtimeConfig.esp32Ip = '192.168.1.50';
    jest.spyOn(esp32Service, 'fetchBoardInfo').mockResolvedValueOnce(mockBoard);

    const res = await request(app).get('/api/proxy/info');
    expect(res.status).toBe(200);
    expect(res.body.chip_model).toBe('ESP32-S3');
  });

  it('returns 502 when ESP32 is unreachable', async () => {
    runtimeConfig.esp32Ip = '192.168.1.50';
    jest.spyOn(esp32Service, 'fetchBoardInfo').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await request(app).get('/api/proxy/info');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/ECONNREFUSED/);
  });
});
