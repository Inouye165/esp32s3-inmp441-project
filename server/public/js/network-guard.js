/**
 * Network Security Guard
 * Continuously monitors network connection and blocks all functionality when on untrusted networks.
 * Include this script on ALL pages that require network security.
 */

'use strict';

class NetworkGuard {
  constructor() {
    this.isNetworkAllowed = null; // null = unknown, false = blocked, true = allowed
    this.checkInterval = null;
    this.CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
    this.overlayEl = null;
    this.currentNetworkEl = null;
    this.allowedNetworksEl = null;
    this.blockedMessageEl = null;
    
    this.init();
  }

  init() {
    // Create blocking overlay if it doesn't exist
    this.createOverlay();
    
    // Start continuous monitoring
    this.startMonitoring();
    
    // Check immediately on load
    this.checkNetwork();
    
    // Re-check when page regains focus (user switched back to tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log('[NetworkGuard] Page visible - checking network');
        this.checkNetwork();
      }
    });

    // Also check on network online/offline events
    window.addEventListener('online', () => {
      console.log('[NetworkGuard] Browser reports online - checking network');
      this.checkNetwork();
    });

    window.addEventListener('offline', () => {
      console.log('[NetworkGuard] Browser reports offline - blocking access');
      this.setNetworkAllowed(false, 'No internet connection');
    });
  }

  createOverlay() {
    // Check if overlay already exists (might be in HTML)
    this.overlayEl = document.getElementById('network-security-overlay');
    
    if (!this.overlayEl) {
      // Create overlay dynamically
      this.overlayEl = document.createElement('div');
      this.overlayEl.id = 'network-security-overlay';
      this.overlayEl.className = 'network-security-overlay';
      this.overlayEl.innerHTML = `
        <div class="network-security-content">
          <div class="mb-4">
            <svg width="80" height="80" viewBox="0 0 100 100" class="text-danger">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="4"/>
              <line x1="30" y1="30" x2="70" y2="70" stroke="currentColor" stroke-width="6"/>
              <line x1="70" y1="30" x2="30" y2="70" stroke="currentColor" stroke-width="6"/>
            </svg>
          </div>
          <h2 class="text-danger mb-3">Network Access Denied</h2>
          <p class="lead mb-2" id="network-blocked-message">You are not connected to an approved network.</p>
          <p class="text-secondary mb-2" id="network-current-info">Checking network...</p>
          <p class="text-muted small mb-4">
            <strong>Allowed networks:</strong>
            <span id="network-allowed-list">Loading...</span>
          </p>
          <p class="text-muted small">
            This application only works on trusted networks for security reasons.
            Please connect to an approved WiFi network to continue.
          </p>
        </div>
      `;
      
      document.body.appendChild(this.overlayEl);
      
      // Add styles if not already present
      if (!document.getElementById('network-guard-styles')) {
        const style = document.createElement('style');
        style.id = 'network-guard-styles';
        style.textContent = `
          .network-security-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(10px);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
          }
          
          .network-security-overlay.d-none {
            display: none !important;
          }
          
          .network-security-content {
            text-align: center;
            max-width: 600px;
            color: #fff;
          }
          
          .network-security-content h2 {
            font-size: 2rem;
            font-weight: bold;
          }
          
          .network-security-content .lead {
            font-size: 1.2rem;
          }
        `;
        document.head.appendChild(style);
      }
    }
    
    // Get reference to dynamic content elements
    this.currentNetworkEl = document.getElementById('network-current-info');
    this.allowedNetworksEl = document.getElementById('network-allowed-list');
    this.blockedMessageEl = document.getElementById('network-blocked-message');
  }

  startMonitoring() {
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Check network every 5 seconds
    this.checkInterval = setInterval(() => {
      this.checkNetwork();
    }, this.CHECK_INTERVAL_MS);
  }

  async checkNetwork() {
    
    try {
      const response = await fetch('/api/network/check', {
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Update UI with network info
      if (this.allowedNetworksEl && data.allowedNetworks) {
        this.allowedNetworksEl.textContent = data.allowedNetworks.length > 0 
          ? data.allowedNetworks.join(', ') 
          : 'None configured';
      }

      if (this.currentNetworkEl) {
        if (data.connected && data.networkName) {
          this.currentNetworkEl.textContent = `Current network: ${data.networkName}`;
        } else {
          this.currentNetworkEl.textContent = 'No WiFi connection detected';
        }
      }

      // Set access based on network approval
      if (data.isAllowed) {
        this.setNetworkAllowed(true);
      } else {
        const message = data.networkName 
          ? `Network "${data.networkName}" is not approved.`
          : 'No approved network connection detected.';
        this.setNetworkAllowed(false, message);
      }

    } catch (err) {
      console.error('[NetworkGuard] Network check failed:', err);
      const errorMsg = err?.message || 'Unknown error';
      
      if (this.currentNetworkEl) {
        this.currentNetworkEl.textContent = `Error: ${errorMsg}`;
      }
      
      this.setNetworkAllowed(false, 'Unable to verify network connection.');
    }
  }

  setNetworkAllowed(allowed, message = null) {
    // Skip if state hasn't changed
    if (this.isNetworkAllowed === allowed) {
      return;
    }

    console.log(`[NetworkGuard] Network access ${allowed ? 'GRANTED' : 'DENIED'}`);
    this.isNetworkAllowed = allowed;

    if (allowed) {
      // Hide overlay, enable page
      this.overlayEl.classList.add('d-none');
      this.enablePageInteractions();
    } else {
      // Show overlay, block page
      if (message && this.blockedMessageEl) {
        this.blockedMessageEl.textContent = message;
      }
      this.overlayEl.classList.remove('d-none');
      this.disablePageInteractions();
    }
  }

  disablePageInteractions() {
    // Prevent all clicks on the page (except overlay)
    document.body.style.pointerEvents = 'none';
    this.overlayEl.style.pointerEvents = 'auto';
    
    // Disable all form inputs
    document.querySelectorAll('input, button, textarea, select, a').forEach(el => {
      if (!this.overlayEl.contains(el)) {
        el.disabled = true;
        el.style.pointerEvents = 'none';
      }
    });

    // Emit event for page-specific cleanup
    document.dispatchEvent(new CustomEvent('networkBlocked'));
  }

  enablePageInteractions() {
    // Re-enable interactions
    document.body.style.pointerEvents = '';
    
    // Re-enable all form inputs
    document.querySelectorAll('input, button, textarea, select, a').forEach(el => {
      if (!this.overlayEl.contains(el)) {
        el.disabled = false;
        el.style.pointerEvents = '';
      }
    });

    // Emit event for page-specific initialization
    document.dispatchEvent(new CustomEvent('networkAllowed'));
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[NetworkGuard] Monitoring stopped');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.networkGuard = new NetworkGuard();
  });
} else {
  window.networkGuard = new NetworkGuard();
}
