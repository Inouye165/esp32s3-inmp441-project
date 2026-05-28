// ── Module Detail Page ──────────────────────────────────────────────────────

const pageEls = {
  loading: document.getElementById('loading-state'),
  error: document.getElementById('error-state'),
  errorMsg: document.getElementById('error-message'),
  content: document.getElementById('module-content'),
  title: document.getElementById('page-title'),
  type: document.getElementById('page-type'),
  model: document.getElementById('page-model'),
  id: document.getElementById('page-id'),
  deviceLink: document.getElementById('page-device-link'),
  editBtn: document.getElementById('page-edit-btn'),
  imageContainer: document.getElementById('page-image-container'),
  rotate0: document.getElementById('rotate-0'),
  rotate90: document.getElementById('rotate-90'),
  rotate180: document.getElementById('rotate-180'),
  rotate270: document.getElementById('rotate-270'),
  identId: document.getElementById('page-ident-id'),
  identModel: document.getElementById('page-ident-model'),
  identMac: document.getElementById('page-ident-mac'),
  identChipId: document.getElementById('page-ident-chipid'),
  netIp: document.getElementById('page-net-ip'),
  netPort: document.getElementById('page-net-port'),
  networkCard: document.getElementById('page-network-card'),
  ledCard: document.getElementById('page-led-card'),
  ledOn: document.getElementById('page-led-on'),
  ledOff: document.getElementById('page-led-off'),
  ledBlink: document.getElementById('page-led-blink'),
  ledMsg: document.getElementById('page-led-msg'),
  pinoutCard: document.getElementById('page-pinout-card'),
  pinoutSchematic: document.getElementById('page-pinout-schematic'),
  viewBottom: document.getElementById('view-bottom'),
  viewTop: document.getElementById('view-top'),
  specsContent: document.getElementById('page-specs-content')
};

let currentModule = null;
let currentRotation = 0;
let currentView = 'bottom'; // 'bottom' or 'top'

// ── Utility Functions ───────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function moduleThumbnail(m) {
  if (m.imageFile) {
    return `<img src="/uploads/${escapeHtml(m.imageFile)}" alt="${escapeHtml(m.name)}" 
                 class="img-fluid rounded">`;
  }
  return `
    <svg viewBox="0 0 100 100" class="module-svg-placeholder">
      <rect width="100" height="100" fill="#1a1a1a" stroke="#444" stroke-width="2"/>
      <text x="50" y="35" text-anchor="middle" fill="#666" font-size="10" font-family="monospace">
        ${escapeHtml(m.type || 'ESP')}
      </text>
      <text x="50" y="50" text-anchor="middle" fill="#888" font-size="28" font-weight="bold">
        📟
      </text>
      <text x="50" y="70" text-anchor="middle" fill="#666" font-size="8" font-family="monospace">
        ${escapeHtml(m.name || 'Module')}
      </text>
      <g stroke="#555" stroke-width="1" fill="none">
        <line x1="10" y1="78" x2="10" y2="86"/><line x1="18" y1="78" x2="18" y2="86"/>
        <line x1="26" y1="78" x2="26" y2="86"/><line x1="34" y1="78" x2="34" y2="86"/>
        <line x1="42" y1="78" x2="42" y2="86"/><line x1="50" y1="78" x2="50" y2="86"/>
        <line x1="58" y1="78" x2="58" y2="86"/><line x1="66" y1="78" x2="66" y2="86"/>
        <line x1="74" y1="78" x2="74" y2="86"/><line x1="82" y1="78" x2="82" y2="86"/>
        <line x1="90" y1="78" x2="90" y2="86"/>
      </g>
    </svg>
  `;
}

// ── Specs Renderer (same as in app.js) ─────────────────────────────────────

function renderModuleSpecs(m) {
  const type = m.type;
  let specsHTML = '';

  if (type === 'ESP8266') {
    specsHTML = `
      <div class="specs-grid-container">
        <div class="specs-card">
          <div class="specs-card-title">⚡ Core Specifications</div>
          <div class="specs-list">
            <div class="specs-row">
              <span class="specs-label">Chip:</span>
              <span class="specs-value">ESP8266 (ESP-12E/F)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">CPU:</span>
              <span class="specs-value">Tensilica L106 32-bit @ 80/160 MHz</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">RAM:</span>
              <span class="specs-value">~80 KB user data RAM</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Flash:</span>
              <span class="specs-value">4 MB (typical)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">GPIO Pins:</span>
              <span class="specs-value">11 usable (D0-D8, RX, TX)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">ADC:</span>
              <span class="specs-value">1× 10-bit (A0, 0-3.3V)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">PWM:</span>
              <span class="specs-value">All GPIO (software)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">I²C:</span>
              <span class="specs-value">Any GPIO (default D1/D2)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">SPI:</span>
              <span class="specs-value">HSPI available</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">UART:</span>
              <span class="specs-value">1× hardware (RX0/TX0)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">I²S:</span>
              <span class="specs-value">1× (shared with UART)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Power:</span>
              <span class="specs-value">5V USB / 3.3V logic</span>
            </div>
          </div>
        </div>

        <div class="specs-card">
          <div class="specs-card-title">📶 Connectivity</div>
          <div class="specs-list">
            <div class="specs-row">
              <span class="specs-label">WiFi:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> 802.11 b/g/n (2.4 GHz)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Modes:</span>
              <span class="specs-value">Station, AP, Station+AP</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Security:</span>
              <span class="specs-value">WPA/WPA2/WPA3</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Max Speed:</span>
              <span class="specs-value">72.2 Mbps</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Range:</span>
              <span class="specs-value">~100m outdoor / ~50m indoor</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Bluetooth:</span>
              <span class="specs-value"><span class="badge-no">NO</span> Not available</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">BLE:</span>
              <span class="specs-value"><span class="badge-no">NO</span> Not available</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Zigbee:</span>
              <span class="specs-value"><span class="badge-no">NO</span> Not available</span>
            </div>
          </div>
          <div class="specs-note">
            <strong>Note:</strong> For Bluetooth/BLE support, use ESP32 instead.
          </div>
        </div>
      </div>

      <div class="specs-card mt-3">
        <div class="specs-card-title">📌 GPIO Pinout — NodeMCU / WeMos D1 Mini</div>
        <table class="pinout-table">
          <thead>
            <tr>
              <th>Pin</th>
              <th>GPIO</th>
              <th>Function / Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pin-label">RST</td>
              <td class="pin-gpio">—</td>
              <td class="pin-func">Reset (active low)</td>
            </tr>
            <tr>
              <td class="pin-label">A0</td>
              <td class="pin-gpio">ADC</td>
              <td class="pin-func">10-bit ADC (0-3.3V max)</td>
            </tr>
            <tr>
              <td class="pin-label">D0</td>
              <td class="pin-gpio">GPIO16</td>
              <td class="pin-func">Wake from deep sleep / LED_BUILTIN (no PWM/I²C/interrupts)</td>
            </tr>
            <tr>
              <td class="pin-label">D1</td>
              <td class="pin-gpio">GPIO5</td>
              <td class="pin-func">SCL (I²C)</td>
            </tr>
            <tr>
              <td class="pin-label">D2</td>
              <td class="pin-gpio">GPIO4</td>
              <td class="pin-func">SDA (I²C)</td>
            </tr>
            <tr>
              <td class="pin-label">D3</td>
              <td class="pin-gpio">GPIO0</td>
              <td class="pin-func">Boot mode (pulled high, must be HIGH at boot)</td>
            </tr>
            <tr>
              <td class="pin-label">D4</td>
              <td class="pin-gpio">GPIO2</td>
              <td class="pin-func">⚠️ Onboard LED (active LOW) — must be HIGH at boot</td>
            </tr>
            <tr>
              <td class="pin-label">D5</td>
              <td class="pin-gpio">GPIO14</td>
              <td class="pin-func">SPI CLK</td>
            </tr>
            <tr>
              <td class="pin-label">D6</td>
              <td class="pin-gpio">GPIO12</td>
              <td class="pin-func">SPI MISO</td>
            </tr>
            <tr>
              <td class="pin-label">D7</td>
              <td class="pin-gpio">GPIO13</td>
              <td class="pin-func">SPI MOSI</td>
            </tr>
            <tr>
              <td class="pin-label">D8</td>
              <td class="pin-gpio">GPIO15</td>
              <td class="pin-func">⚠️ SPI SS (pulled low, must be LOW at boot)</td>
            </tr>
            <tr>
              <td class="pin-label">RX</td>
              <td class="pin-gpio">GPIO3</td>
              <td class="pin-func">UART RX0 (D9)</td>
            </tr>
            <tr>
              <td class="pin-label">TX</td>
              <td class="pin-gpio">GPIO1</td>
              <td class="pin-func">UART TX0 (D10)</td>
            </tr>
            <tr>
              <td class="pin-label">GND</td>
              <td class="pin-gpio">—</td>
              <td class="pin-func">Ground</td>
            </tr>
            <tr>
              <td class="pin-label">3V3</td>
              <td class="pin-gpio">—</td>
              <td class="pin-func">3.3V regulated output</td>
            </tr>
            <tr>
              <td class="pin-label">5V</td>
              <td class="pin-gpio">—</td>
              <td class="pin-func">5V input (from USB)</td>
            </tr>
          </tbody>
        </table>
        <div class="specs-note">
          <strong>⚠️ Important Boot Pins:</strong><br>
          • D3 (GPIO0) must be HIGH at boot<br>
          • D4 (GPIO2) must be HIGH at boot<br>
          • D8 (GPIO15) must be LOW at boot<br><br>
          <strong>Onboard LED:</strong> GPIO2 (D4) — active LOW on most NodeMCU boards<br>
          <strong>3.3V Logic:</strong> All GPIO are 3.3V — do NOT connect 5V signals directly
        </div>
      </div>
    `;
  } else if (type === 'ESP32-S3') {
    specsHTML = `
      <div class="specs-grid-container">
        <div class="specs-card">
          <div class="specs-card-title">⚡ Core Specifications</div>
          <div class="specs-list">
            <div class="specs-row">
              <span class="specs-label">Chip:</span>
              <span class="specs-value">ESP32-S3 (Xtensa dual-core)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">CPU:</span>
              <span class="specs-value">Xtensa LX7 @ 240 MHz (dual-core)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">RAM:</span>
              <span class="specs-value">512 KB SRAM</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">PSRAM:</span>
              <span class="specs-value">2/8 MB (optional)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Flash:</span>
              <span class="specs-value">4/8/16 MB</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">GPIO Pins:</span>
              <span class="specs-value">45 programmable GPIOs</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">ADC:</span>
              <span class="specs-value">2× 12-bit SAR ADC (20 channels)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">DAC:</span>
              <span class="specs-value">None (use PWM)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Touch:</span>
              <span class="specs-value">14× capacitive touch sensors</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">I²C:</span>
              <span class="specs-value">2× I²C</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">SPI:</span>
              <span class="specs-value">4× SPI</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">UART:</span>
              <span class="specs-value">3× UART</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">I²S:</span>
              <span class="specs-value">2× I²S (audio)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">USB:</span>
              <span class="specs-value">USB OTG 1.1 (native)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Power:</span>
              <span class="specs-value">3.3V logic</span>
            </div>
          </div>
        </div>

        <div class="specs-card">
          <div class="specs-card-title">📶 Connectivity</div>
          <div class="specs-list">
            <div class="specs-row">
              <span class="specs-label">WiFi:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> 802.11 b/g/n (2.4 GHz)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">WiFi 6:</span>
              <span class="specs-value"><span class="badge-no">NO</span> (use ESP32-C6)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Bluetooth:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> Bluetooth 5.0 LE</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">BLE:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> BLE 5.0</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Classic BT:</span>
              <span class="specs-value"><span class="badge-no">NO</span> (BLE only)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Zigbee:</span>
              <span class="specs-value"><span class="badge-no">NO</span> Not available</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Thread:</span>
              <span class="specs-value"><span class="badge-no">NO</span> Not available</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Matter:</span>
              <span class="specs-value"><span class="badge-info">VIA BLE</span> Bridge mode</span>
            </div>
          </div>
          <div class="specs-note">
            <strong>Note:</strong> For Zigbee/Thread/Matter native support, use ESP32-H2 or ESP32-C6.
          </div>
        </div>
      </div>

      <div class="specs-card mt-3">
        <div class="specs-card-title">📌 Key GPIO Pins (ESP32-S3)</div>
        <table class="pinout-table">
          <thead>
            <tr>
              <th>GPIO</th>
              <th>Function / Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pin-gpio">GPIO0</td>
              <td class="pin-func">Boot button (pulled high)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO1-14</td>
              <td class="pin-func">General purpose I/O, ADC1, Touch</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO15-16</td>
              <td class="pin-func">General purpose I/O, ADC2</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO17-18</td>
              <td class="pin-func">General purpose I/O, ADC2, DAC (on some variants)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO19-20</td>
              <td class="pin-func">USB D-/D+ (native USB OTG)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO21</td>
              <td class="pin-func">General purpose I/O</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO26-48</td>
              <td class="pin-func">⚠️ Not all available on devkits — check your board pinout</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO43-44</td>
              <td class="pin-func">UART0 TX/RX (USB serial)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO45</td>
              <td class="pin-func">⚠️ Strapping pin (VDD_SPI voltage)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO46</td>
              <td class="pin-func">⚠️ Strapping pin (boot mode)</td>
            </tr>
          </tbody>
        </table>
        <div class="specs-note">
          <strong>⚠️ Important:</strong><br>
          • GPIO19-20 are used for USB — avoid using if USB is needed<br>
          • GPIO45-46 are strapping pins — be careful with external connections<br>
          • Actual available GPIOs depend on your devkit board<br>
          • Check your specific board's pinout diagram for exact mappings<br>
          • PSRAM may occupy some GPIOs (GPIO35-37 on some boards)
        </div>
      </div>
    `;
  } else if (type === 'ESP32') {
    specsHTML = `
      <div class="specs-grid-container">
        <div class="specs-card">
          <div class="specs-card-title">⚡ Core Specifications</div>
          <div class="specs-list">
            <div class="specs-row">
              <span class="specs-label">Chip:</span>
              <span class="specs-value">ESP32-D0WD (Xtensa dual-core)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">CPU:</span>
              <span class="specs-value">Xtensa LX6 @ 240 MHz (dual-core)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">RAM:</span>
              <span class="specs-value">520 KB SRAM</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">PSRAM:</span>
              <span class="specs-value">4 MB (optional, WROVER)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Flash:</span>
              <span class="specs-value">4 MB (typical)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">GPIO Pins:</span>
              <span class="specs-value">34 programmable GPIOs</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">ADC:</span>
              <span class="specs-value">2× 12-bit SAR ADC (18 channels)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">DAC:</span>
              <span class="specs-value">2× 8-bit DAC</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Touch:</span>
              <span class="specs-value">10× capacitive touch sensors</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">I²C:</span>
              <span class="specs-value">2× I²C</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">SPI:</span>
              <span class="specs-value">4× SPI</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">UART:</span>
              <span class="specs-value">3× UART</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">I²S:</span>
              <span class="specs-value">2× I²S (audio)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Hall Sensor:</span>
              <span class="specs-value">Built-in Hall effect sensor</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Power:</span>
              <span class="specs-value">3.3V logic</span>
            </div>
          </div>
        </div>

        <div class="specs-card">
          <div class="specs-card-title">📶 Connectivity</div>
          <div class="specs-list">
            <div class="specs-row">
              <span class="specs-label">WiFi:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> 802.11 b/g/n (2.4 GHz)</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Bluetooth:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> Bluetooth 4.2 BR/EDR + BLE</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">BLE:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> BLE 4.2</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Classic BT:</span>
              <span class="specs-value"><span class="badge-yes">YES</span> A2DP, HFP, SPP</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Zigbee:</span>
              <span class="specs-value"><span class="badge-no">NO</span> Not available</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Thread:</span>
              <span class="specs-value"><span class="badge-no">NO</span> Not available</span>
            </div>
            <div class="specs-row">
              <span class="specs-label">Matter:</span>
              <span class="specs-value"><span class="badge-info">VIA BLE</span> Bridge mode</span>
            </div>
          </div>
          <div class="specs-note">
            <strong>Note:</strong> Classic ESP32 supports both Classic Bluetooth and BLE, unlike ESP32-S3 (BLE only).
          </div>
        </div>
      </div>

      <div class="specs-card mt-3">
        <div class="specs-card-title">📌 Key GPIO Pins (ESP32 DevKit V1)</div>
        <table class="pinout-table">
          <thead>
            <tr>
              <th>GPIO</th>
              <th>Function / Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pin-gpio">GPIO0</td>
              <td class="pin-func">⚠️ Boot button (pulled high, LOW = boot mode)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO1</td>
              <td class="pin-func">UART0 TX (USB serial)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO2</td>
              <td class="pin-func">⚠️ Onboard LED (must be LOW or floating at boot)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO3</td>
              <td class="pin-func">UART0 RX (USB serial)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO4-5</td>
              <td class="pin-func">General purpose I/O</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO6-11</td>
              <td class="pin-func">⚠️ Connected to SPI flash — DO NOT USE</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO12</td>
              <td class="pin-func">⚠️ Strapping pin (boot voltage)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO13-15</td>
              <td class="pin-func">General purpose I/O</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO16-17</td>
              <td class="pin-func">General purpose I/O (PSRAM on WROVER)</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO18-19</td>
              <td class="pin-func">General purpose I/O, SPI</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO21-23</td>
              <td class="pin-func">General purpose I/O, I²C</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO25-27</td>
              <td class="pin-func">General purpose I/O, DAC1/DAC2, ADC2</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO32-33</td>
              <td class="pin-func">General purpose I/O, ADC1, Touch</td>
            </tr>
            <tr>
              <td class="pin-gpio">GPIO34-39</td>
              <td class="pin-func">⚠️ Input ONLY (no pull-up/pull-down), ADC1</td>
            </tr>
          </tbody>
        </table>
        <div class="specs-note">
          <strong>⚠️ Important Restrictions:</strong><br>
          • GPIO6-11: Connected to SPI flash — never use<br>
          • GPIO34-39: Input only — cannot be used as outputs<br>
          • GPIO0, 2, 12, 15: Strapping pins — check boot requirements<br>
          • GPIO1, 3: Used for USB serial — avoid if serial needed<br>
          • ADC2 cannot be used when WiFi is active
        </div>
      </div>
    `;
  } else {
    specsHTML = `
      <div class="text-secondary text-center py-3">
        Module specifications not available for type: ${escapeHtml(type)}
      </div>
    `;
  }

  return specsHTML;
}

// ── Page Load & Module Fetch ────────────────────────────────────────────────

async function loadModule() {
  const params = new URLSearchParams(window.location.search);
  const moduleId = params.get('id');

  if (!moduleId) {
    showError('No module ID specified');
    return;
  }

  try {
    const response = await fetch(`/api/modules/${encodeURIComponent(moduleId)}`);
    if (!response.ok) {
      throw new Error(`Failed to load module: ${response.statusText}`);
    }

    const module = await response.json();
    currentModule = module;
    renderPage(module);
  } catch (err) {
    console.error('Error loading module:', err);
    showError(err.message);
  }
}

function showError(message) {
  pageEls.loading.classList.add('d-none');
  pageEls.content.classList.add('d-none');
  pageEls.error.classList.remove('d-none');
  pageEls.errorMsg.textContent = message;
}

function renderPage(m) {
  pageEls.loading.classList.add('d-none');
  pageEls.content.classList.remove('d-none');

  // Header
  document.title = `${m.name} - Module Details`;
  pageEls.title.textContent = m.name;
  pageEls.type.textContent = m.type;
  pageEls.model.textContent = m.model || m.type;
  pageEls.id.textContent = m.id;

  // Device link
  if (m.ip && m.port) {
    pageEls.deviceLink.href = `http://${m.ip}:${m.port}`;
    pageEls.deviceLink.classList.remove('d-none');
  }

  // Edit button
  pageEls.editBtn.addEventListener('click', () => {
    window.location.href = `/?edit=${encodeURIComponent(m.id)}`;
  });

  // Image
  pageEls.imageContainer.innerHTML = moduleThumbnail(m);
  pageEls.imageContainer.className = 'module-detail-image rotate-0';

  // Identity
  pageEls.identId.textContent = m.id || '—';
  pageEls.identModel.textContent = m.model || m.type || '—';
  pageEls.identMac.textContent = m.macAddress || '—';
  pageEls.identChipId.textContent = m.chipId || '—';

  // Network
  pageEls.netIp.textContent = m.ip || 'Not configured';
  pageEls.netPort.textContent = m.port || '80';

  // LED Control
  if (m.hasLed && m.ip && m.port) {
    pageEls.ledCard.classList.remove('d-none');
    setupLedControls(m);
  }

  // Specs
  pageEls.specsContent.innerHTML = renderModuleSpecs(m);

  // Pinout schematic (only for ESP8266 for now)
  if (m.type === 'ESP8266') {
    renderPinoutSchematic(m);
  } else {
    pageEls.pinoutCard.classList.add('d-none');
  }
}

// ── LED Control ─────────────────────────────────────────────────────────────

function setupLedControls(m) {
  const baseUrl = `http://${m.ip}:${m.port}`;
  const btns = [
    { el: pageEls.ledOn, path: '/led/on', text: '✓ ON' },
    { el: pageEls.ledOff, path: '/led/off', text: '✓ OFF' },
    { el: pageEls.ledBlink, path: '/led/blink', text: '✓ BLINKING' }
  ];

  btns.forEach(btn => {
    btn.el.addEventListener('click', async () => {
      try {
        pageEls.ledMsg.textContent = 'Sending...';
        pageEls.ledMsg.className = 'small mt-2 text-info';
        
        const res = await fetch(baseUrl + btn.path, { 
          method: 'GET',
          mode: 'no-cors' 
        });
        
        pageEls.ledMsg.textContent = btn.text;
        pageEls.ledMsg.className = 'small mt-2 text-success';
        
        setTimeout(() => {
          pageEls.ledMsg.textContent = '';
        }, 2000);
      } catch (err) {
        console.error('LED control error:', err);
        pageEls.ledMsg.textContent = `Error: ${err.message}`;
        pageEls.ledMsg.className = 'small mt-2 text-danger';
      }
    });
  });
}

// ── Pinout Schematic Rendering ─────────────────────────────────────────────

function renderPinoutSchematic(m) {
  if (m.type === 'ESP8266') {
    renderESP8266Pinout();
  }
}

function renderESP8266Pinout() {
  // NodeMCU v2 pinout - 15 pins per side
  // Bottom view (default): USB at bottom, D0 top-left, A0 top-right, VIN bottom-left, 3V3 bottom-right
  // Top view: Mirrored horizontally, USB at bottom

  const leftPins = [
    { label: 'D0', gpio: 'GPIO16', notes: 'Wake from deep sleep / LED_BUILTIN (no PWM/I²C/interrupts)', type: 'gpio' },
    { label: 'D1', gpio: 'GPIO5', notes: 'SCL (I²C)', type: 'gpio' },
    { label: 'D2', gpio: 'GPIO4', notes: 'SDA (I²C)', type: 'gpio' },
    { label: 'D3', gpio: 'GPIO0', notes: '⚠️ Boot mode (pulled high, must be HIGH at boot)', type: 'gpio' },
    { label: 'D4', gpio: 'GPIO2', notes: '⚠️ Onboard LED (active LOW) — must be HIGH at boot', type: 'gpio' },
    { label: '3V3', gpio: '—', notes: '3.3V regulated output', type: 'power' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' },
    { label: 'D5', gpio: 'GPIO14', notes: 'SPI CLK', type: 'gpio' },
    { label: 'D6', gpio: 'GPIO12', notes: 'SPI MISO', type: 'gpio' },
    { label: 'D7', gpio: 'GPIO13', notes: 'SPI MOSI', type: 'gpio' },
    { label: 'D8', gpio: 'GPIO15', notes: '⚠️ SPI SS (pulled low, must be LOW at boot)', type: 'gpio' },
    { label: 'RX', gpio: 'GPIO3', notes: 'UART RX0 (D9)', type: 'gpio' },
    { label: 'TX', gpio: 'GPIO1', notes: 'UART TX0 (D10)', type: 'gpio' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' },
    { label: 'VIN', gpio: '—', notes: '5V input (from USB)', type: 'power' }
  ];

  const rightPins = [
    { label: 'A0', gpio: 'ADC', notes: '10-bit ADC (0-3.3V max)', type: 'gpio' },
    { label: 'RST', gpio: '—', notes: 'Reset (active low)', type: 'power' },
    { label: 'RSV', gpio: '—', notes: 'Reserved', type: 'power' },
    { label: 'RSV', gpio: '—', notes: 'Reserved', type: 'power' },
    { label: 'SD3', gpio: 'GPIO10', notes: 'Flash SPI (SD3)', type: 'gpio' },
    { label: 'SD2', gpio: 'GPIO9', notes: 'Flash SPI (SD2)', type: 'gpio' },
    { label: 'SD1', gpio: 'GPIO8', notes: 'Flash SPI (SD1)', type: 'gpio' },
    { label: 'CMD', gpio: 'GPIO11', notes: 'Flash SPI (CMD)', type: 'gpio' },
    { label: 'SD0', gpio: 'GPIO7', notes: 'Flash SPI (SD0)', type: 'gpio' },
    { label: 'CLK', gpio: 'GPIO6', notes: 'Flash SPI (CLK)', type: 'gpio' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' },
    { label: '3V3', gpio: '—', notes: '3.3V regulated output', type: 'power' },
    { label: 'EN', gpio: '—', notes: 'Enable (CH_PD)', type: 'power' },
    { label: 'RST', gpio: '—', notes: 'Reset (active low)', type: 'power' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' }
  ];

  // Adjust for top/bottom view
  let leftDisplay = leftPins;
  let rightDisplay = rightPins;

  if (currentView === 'top') {
    // Top view: swap sides and keep same top-to-bottom order
    leftDisplay = rightPins;
    rightDisplay = leftPins;
  }

  const leftHTML = leftDisplay.map((pin, idx) => `
    <div class="gpio-pin-row ${pin.type}">
      <div class="gpio-pin-number">${idx + 1}</div>
      <div class="gpio-pin-hole"></div>
      <div class="gpio-pin-content">
        <div class="gpio-pin-line1">
          <span class="gpio-pin-label">${escapeHtml(pin.label)}</span>
          <span class="gpio-pin-gpio">${escapeHtml(pin.gpio)}</span>
        </div>
        <div class="gpio-pin-line2">
          <span class="gpio-pin-notes">${escapeHtml(pin.notes)}</span>
        </div>
      </div>
    </div>
  `).join('');

  const rightHTML = rightDisplay.map((pin, idx) => `
    <div class="gpio-pin-row ${pin.type}">
      <div class="gpio-pin-content">
        <div class="gpio-pin-line1">
          <span class="gpio-pin-gpio">${escapeHtml(pin.gpio)}</span>
          <span class="gpio-pin-label">${escapeHtml(pin.label)}</span>
        </div>
        <div class="gpio-pin-line2">
          <span class="gpio-pin-notes">${escapeHtml(pin.notes)}</span>
        </div>
      </div>
      <div class="gpio-pin-hole"></div>
      <div class="gpio-pin-number">${idx + 16}</div>
    </div>
  `).join('');

  const viewLabel = currentView === 'bottom' ? 'BOTTOM VIEW' : 'TOP VIEW';

  pageEls.pinoutSchematic.innerHTML = `
    <div class="gpio-pinout-schematic">
      <div class="gpio-board">
        <div class="gpio-board-title">NodeMCU v2 — ${viewLabel}</div>
        <div class="gpio-pins-container">
          <div class="gpio-pin-side left">
            ${leftHTML}
          </div>
          <div class="gpio-pin-side right">
            ${rightHTML}
          </div>
        </div>
        <div class="gpio-usb-port">⬜ USB Port (Bottom)</div>
      </div>
      <div class="gpio-warning-note">
        <strong>⚠️ Boot Requirements:</strong> D3 (GPIO0) must be HIGH, D4 (GPIO2) must be HIGH, D8 (GPIO15) must be LOW at boot.<br>
        <strong>💡 Onboard LED:</strong> GPIO2 (D4) — active LOW on most NodeMCU boards.<br>
        <strong>⚡ Voltage:</strong> All GPIO are 3.3V — do NOT connect 5V signals directly.
      </div>
    </div>
  `;
}

// ── Image Rotation ──────────────────────────────────────────────────────────

function setRotation(degrees) {
  currentRotation = degrees;
  pageEls.imageContainer.className = `module-detail-image rotate-${degrees}`;
}

// ── Initialize ──────────────────────────────────────────────────────────────

// Rotation buttons
pageEls.rotate0.addEventListener('click', () => setRotation(0));
pageEls.rotate90.addEventListener('click', () => setRotation(90));
pageEls.rotate180.addEventListener('click', () => setRotation(180));
pageEls.rotate270.addEventListener('click', () => setRotation(270));

// View toggle
pageEls.viewBottom.addEventListener('change', () => {
  if (pageEls.viewBottom.checked) {
    currentView = 'bottom';
    if (currentModule && currentModule.type === 'ESP8266') {
      renderESP8266Pinout();
    }
  }
});

pageEls.viewTop.addEventListener('change', () => {
  if (pageEls.viewTop.checked) {
    currentView = 'top';
    if (currentModule && currentModule.type === 'ESP8266') {
      renderESP8266Pinout();
    }
  }
});

loadModule();
