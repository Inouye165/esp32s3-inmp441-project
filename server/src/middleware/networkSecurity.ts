import { Request, Response, NextFunction } from 'express';
import { checkNetworkConnection } from '../services/networkChecker';

// Cache network status for performance (check every 5 seconds max)
let cachedNetworkStatus: { isAllowed: boolean; timestamp: number } | null = null;
const CACHE_DURATION_MS = 5000;

/**
 * Middleware to block all API requests when not on an approved network.
 * This ensures no functionality works on untrusted networks.
 */
export async function networkSecurityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Allow network check endpoint (needed to show users why they're blocked)
  // req.path is relative to the mount point, so it's '/network/check' not '/api/network/check'
  if (req.path === '/network/check') {
    next();
    return;
  }

  try {
    // Use cached status if recent enough
    const now = Date.now();
    if (cachedNetworkStatus && (now - cachedNetworkStatus.timestamp) < CACHE_DURATION_MS) {
      if (!cachedNetworkStatus.isAllowed) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'This server only accepts requests when connected to an approved network.',
          code: 'NETWORK_NOT_APPROVED'
        });
        return;
      }
      next();
      return;
    }

    // Check network connection
    const networkInfo = await checkNetworkConnection();
    
    // Update cache
    cachedNetworkStatus = {
      isAllowed: networkInfo.isAllowed,
      timestamp: now
    };

    if (!networkInfo.isAllowed) {
      console.warn(`[NetworkSecurity] Blocked ${req.method} ${req.path} - Not on approved network`);
      res.status(403).json({
        error: 'Forbidden',
        message: 'This server only accepts requests when connected to an approved network.',
        code: 'NETWORK_NOT_APPROVED',
        currentNetwork: networkInfo.networkName,
        allowedNetworks: networkInfo.allowedNetworks
      });
      return;
    }

    // Network is approved, proceed
    next();
  } catch (error) {
    console.error('[NetworkSecurity] Error checking network:', error);
    // On error, fail closed (deny access)
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Unable to verify network security.',
      code: 'NETWORK_CHECK_FAILED'
    });
  }
}

/**
 * Clear the network status cache (useful for testing or forced refresh)
 */
export function clearNetworkCache(): void {
  cachedNetworkStatus = null;
}
