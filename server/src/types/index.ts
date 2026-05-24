// Shared TypeScript types for ESP32-S3 INMP441 API

export interface MicrophonePins {
  sck: number;
  ws: number;
  sd: number;
  lr: string;
  vdd: string;
}

export interface MicrophoneInfo {
  type: string;
  interface: string;
  sample_rate: number;
  bits: number;
  channel: string;
  pins: MicrophonePins;
}

export interface BoardInfo {
  firmware_version: string;
  board: string;
  chip_model: string;
  chip_revision: number;
  chip_cores: number;
  flash_size_bytes: number;
  psram_size_bytes: number;
  free_heap_bytes: number;
  sdk_version: string;
  mac: string;
  ip: string;
  ssid: string;
  rssi_dbm: number;
  uptime_ms: number;
  microphone: MicrophoneInfo;
}

export interface AudioLevel {
  rms: number;
  db_fs: number;
  peak: number;
  timestamp_ms: number;
}

export interface Esp32Config {
  ip: string;
  port: number;
}

export interface ApiError {
  error: string;
  statusCode?: number;
}
