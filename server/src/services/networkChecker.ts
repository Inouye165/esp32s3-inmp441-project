import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Read allowed networks from environment variable (comma-separated)
// Defaults to empty array if not set, which will block all networks
const ALLOWED_NETWORKS = process.env.ALLOWED_NETWORKS
  ? process.env.ALLOWED_NETWORKS.split(',').map(n => n.trim())
  : [];

interface NetworkInfo {
  connected: boolean;
  networkName: string | null;
  isAllowed: boolean;
  allowedNetworks: string[];
}

/**
 * Check the current WiFi network connection
 * @returns Network information including connection status and network name
 */
export async function checkNetworkConnection(): Promise<NetworkInfo> {
  try {
    const networkName = await getCurrentNetworkName();
    
    const isAllowed = networkName ? ALLOWED_NETWORKS.includes(networkName) : false;
    
    return {
      connected: networkName !== null,
      networkName,
      isAllowed,
      allowedNetworks: ALLOWED_NETWORKS,
    };
  } catch (error) {
    console.error('Error checking network:', error);
    return {
      connected: false,
      networkName: null,
      isAllowed: false,
      allowedNetworks: ALLOWED_NETWORKS,
    };
  }
}

/**
 * Get the current WiFi network name (SSID)
 * Works on Windows, macOS, and Linux
 */
async function getCurrentNetworkName(): Promise<string | null> {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      return await getWindowsNetworkName();
    } else if (platform === 'darwin') {
      return await getMacNetworkName();
    } else if (platform === 'linux') {
      return await getLinuxNetworkName();
    }
    return null;
  } catch (error) {
    console.error('Failed to get network name:', error);
    return null;
  }
}

/**
 * Get WiFi network name on Windows using netsh
 */
async function getWindowsNetworkName(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('netsh wlan show interfaces');
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      const match = line.trim().match(/^\s*SSID\s*:\s*(.+)$/);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get WiFi network name on macOS using airport
 */
async function getMacNetworkName(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I'
    );
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      const match = line.trim().match(/^\s*SSID:\s*(.+)$/);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get WiFi network name on Linux using nmcli or iwgetid
 */
async function getLinuxNetworkName(): Promise<string | null> {
  // Try nmcli first (NetworkManager)
  try {
    const { stdout } = await execAsync(
      'nmcli -t -f active,ssid dev wifi | grep \'^yes\' | cut -d: -f2'
    );
    const ssid = stdout.trim();
    if (ssid) return ssid;
  } catch {
    // Fall through to iwgetid
  }

  // Try iwgetid as fallback
  try {
    const { stdout } = await execAsync('iwgetid -r');
    const ssid = stdout.trim();
    if (ssid) return ssid;
  } catch {
    // No network found
  }

  return null;
}
