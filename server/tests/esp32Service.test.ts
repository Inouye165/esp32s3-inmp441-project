import { parseAudioLevel, parseBoardInfo } from '../src/services/esp32Service';

describe('parseAudioLevel', () => {
  it('parses a valid payload', () => {
    const raw = { rms: 1234.5, db_fs: -42.1, peak: 8000, timestamp_ms: 12345 };
    const result = parseAudioLevel(raw);
    expect(result).toEqual({ rms: 1234.5, db_fs: -42.1, peak: 8000, timestamp_ms: 12345 });
  });

  it('throws on null input', () => {
    expect(() => parseAudioLevel(null)).toThrow(TypeError);
  });

  it('throws on non-object input', () => {
    expect(() => parseAudioLevel('bad')).toThrow(TypeError);
  });

  it('throws when a numeric field is missing', () => {
    expect(() => parseAudioLevel({ rms: 1, db_fs: -40, peak: 100 })).toThrow(TypeError);
  });

  it('throws when a field is a non-numeric string', () => {
    const raw = { rms: 'loud', db_fs: -42, peak: 8000, timestamp_ms: 100 };
    expect(() => parseAudioLevel(raw)).toThrow(TypeError);
  });

  it('coerces numeric strings to numbers', () => {
    // The ESP32 may send numbers as strings in some edge cases
    const raw = { rms: '500', db_fs: '-50.0', peak: '1000', timestamp_ms: '99' };
    const result = parseAudioLevel(raw);
    expect(result.rms).toBe(500);
    expect(result.db_fs).toBe(-50);
  });
});

describe('parseBoardInfo', () => {
  const validBoardInfo = {
    firmware_version: '1.0.0',
    board: 'ESP32-S3-DevKitC-1',
    chip_model: 'ESP32-S3',
    chip_revision: 0,
    chip_cores: 2,
    flash_size_bytes: 8388608,
    psram_size_bytes: 0,
    free_heap_bytes: 300000,
    sdk_version: 'v5.1.0',
    mac: 'AA:BB:CC:DD:EE:FF',
    ip: '192.168.1.50',
    ssid: 'Dobby',
    rssi_dbm: -65,
    uptime_ms: 60000,
    microphone: {
      type: 'INMP441',
      interface: 'I2S',
      sample_rate: 44100,
      bits: 32,
      channel: 'Left',
      pins: { sck: 14, ws: 15, sd: 32, lr: 'GND', vdd: '3.3V' },
    },
  };

  it('parses a valid payload', () => {
    const result = parseBoardInfo(validBoardInfo);
    expect(result.chip_model).toBe('ESP32-S3');
    expect(result.microphone.pins.sck).toBe(14);
  });

  it('throws on null input', () => {
    expect(() => parseBoardInfo(null)).toThrow(TypeError);
  });

  it('throws when a required string field is missing', () => {
    const { ip: _ip, ...missing } = validBoardInfo;
    expect(() => parseBoardInfo(missing)).toThrow(/ip/);
  });

  it('throws when microphone object is missing', () => {
    const { microphone: _mic, ...missing } = validBoardInfo;
    expect(() => parseBoardInfo(missing)).toThrow(/microphone/);
  });
});
