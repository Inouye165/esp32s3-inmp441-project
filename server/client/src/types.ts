export interface Module {
  id: string;
  name: string;
  type: string;
  model: string;
  imageFile?: string;
  ip?: string;
  port?: number;
  hasLed?: boolean;
  macAddress?: string;
  chipId?: string;
}

export interface PinData {
  label: string;
  gpio: string;
  notes: string;
  type: 'gpio' | 'power' | 'ground';
}
