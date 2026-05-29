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
  imageDisplay: document.getElementById('page-image-display'),
  carouselPrev: document.getElementById('carousel-prev'),
  carouselNext: document.getElementById('carousel-next'),
  carouselCounter: document.getElementById('carousel-counter'),
  carouselNav: document.getElementById('carousel-nav'),
  rotate0: document.getElementById('rotate-0'),
  rotate90: document.getElementById('rotate-90'),
  rotate180: document.getElementById('rotate-180'),
  rotate270: document.getElementById('rotate-270'),
  uploadInput: document.getElementById('image-upload-input'),
  uploadStatus: document.getElementById('upload-status'),
  deleteImageBtn: document.getElementById('delete-image-btn'),
  setDefaultBtn: document.getElementById('set-default-btn'),
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
  specsContent: document.getElementById('page-specs-content'),
  partsContent: document.getElementById('page-parts-content'),
  partsEditBtn: document.getElementById('parts-edit-btn'),
  partsSaveBtn: document.getElementById('parts-save-btn'),
  partsCancelBtn: document.getElementById('parts-cancel-btn'),
  partsAddBtn: document.getElementById('parts-add-btn'),
  notesContent: document.getElementById('page-notes-content'),
  notesEditBtn: document.getElementById('notes-edit-btn'),
  notesSaveBtn: document.getElementById('notes-save-btn'),
  notesCancelBtn: document.getElementById('notes-cancel-btn')
};

let currentModule = null;
let currentImageIndex = 0;
let currentView = 'bottom'; // 'bottom' or 'top'
let isEditMode = false;
let currentPinout = null;
let isPartsEditMode = false;
let isNotesEditMode = false;
let currentParts = null;
let currentNotes = null;

// Smart back navigation based on referrer parameter
function goBack() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  
  if (from === 'modules') {
    // Navigate to home page with modules tab active
    window.location.href = '/?tab=modules';
  } else if (window.history.length > 1) {
    // Try browser back if there's history
    window.history.back();
  } else {
    // Fallback to home page
    window.location.href = '/';
  }
}

// ── Default Pinout Templates ───────────────────────────────────────────────

const DEFAULT_ESP8266_PINOUT = {
  leftPins: [
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
  ],
  rightPins: [
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
  ]
};

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

  // Initialize image carousel - show default image first if available
  currentImageIndex = 0;
  if (m.images && m.images.length > 0) {
    const defaultIndex = m.images.findIndex(img => img.isDefault);
    if (defaultIndex >= 0) {
      currentImageIndex = defaultIndex;
    }
  }
  updateImageDisplay();

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

  // Parts & Components
  renderParts(m);

  // Notes
  renderNotes(m);
}

// ── Parts & Components ──────────────────────────────────────────────────────

function renderParts(m) {
  currentParts = m.parts || [];
  updatePartsDisplay();
  setupPartsEventListeners();
}

function updatePartsDisplay() {
  if (!currentParts || currentParts.length === 0) {
    pageEls.partsContent.innerHTML = '<div class="text-secondary small text-center py-3">No parts or components added yet. Click "Add Component" to get started.</div>';
    return;
  }

  let html = '<div class="parts-list">';
  currentParts.forEach((part, idx) => {
    if (isPartsEditMode) {
      html += renderPartEdit(part, idx);
    } else {
      html += renderPartView(part, idx);
    }
  });
  html += '</div>';
  pageEls.partsContent.innerHTML = html;

  if (isPartsEditMode) {
    setupPartEditListeners();
  }
}

function renderPartView(part, idx) {
  return `
    <div class="part-card card bg-black border-secondary mb-3" data-index="${idx}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h6 class="text-info mb-0">${escapeHtml(part.name || 'Unnamed Component')}</h6>
          <span class="badge bg-secondary">${escapeHtml(part.type || 'Component')}</span>
        </div>
        ${part.description ? `<p class="small text-light mb-2">${escapeHtml(part.description)}</p>` : ''}
        <div class="row g-2 small">
          ${part.manufacturer ? `<div class="col-md-4"><span class="text-secondary">Manufacturer:</span> ${escapeHtml(part.manufacturer)}</div>` : ''}
          ${part.model ? `<div class="col-md-4"><span class="text-secondary">Model:</span> ${escapeHtml(part.model)}</div>` : ''}
          ${part.quantity !== undefined ? `<div class="col-md-4"><span class="text-secondary">Quantity:</span> ${part.quantity}</div>` : ''}
          ${part.datasheet ? `<div class="col-12 mt-2"><span class="text-secondary">Datasheet:</span> <a href="${escapeHtml(part.datasheet)}" target="_blank" class="text-info">View →</a></div>` : ''}
          ${part.notes ? `<div class="col-12 mt-2"><span class="text-secondary">Notes:</span> ${escapeHtml(part.notes)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderPartEdit(part, idx) {
  return `
    <div class="part-card card bg-black border-secondary mb-3" data-index="${idx}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <h6 class="text-warning mb-0">✏️ Editing Component</h6>
          <button class="btn btn-sm btn-outline-danger part-delete-btn" data-index="${idx}">🗑️ Delete</button>
        </div>
        <div class="row g-2">
          <div class="col-md-8">
            <label class="form-label small text-secondary">Name *</label>
            <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                   data-field="name" data-index="${idx}" value="${escapeHtml(part.name || '')}" placeholder="e.g., INMP441 Microphone">
          </div>
          <div class="col-md-4">
            <label class="form-label small text-secondary">Type</label>
            <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                   data-field="type" data-index="${idx}" value="${escapeHtml(part.type || '')}" placeholder="e.g., Microphone">
          </div>
          <div class="col-md-6">
            <label class="form-label small text-secondary">Manufacturer</label>
            <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                   data-field="manufacturer" data-index="${idx}" value="${escapeHtml(part.manufacturer || '')}" placeholder="e.g., InvenSense">
          </div>
          <div class="col-md-4">
            <label class="form-label small text-secondary">Model</label>
            <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                   data-field="model" data-index="${idx}" value="${escapeHtml(part.model || '')}" placeholder="e.g., INMP441">
          </div>
          <div class="col-md-2">
            <label class="form-label small text-secondary">Qty</label>
            <input type="number" class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                   data-field="quantity" data-index="${idx}" value="${part.quantity !== undefined ? part.quantity : ''}" min="0">
          </div>
          <div class="col-12">
            <label class="form-label small text-secondary">Description</label>
            <textarea class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                      data-field="description" data-index="${idx}" rows="2" placeholder="Brief description of the component">${escapeHtml(part.description || '')}</textarea>
          </div>
          <div class="col-12">
            <label class="form-label small text-secondary">Datasheet URL</label>
            <input type="url" class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                   data-field="datasheet" data-index="${idx}" value="${escapeHtml(part.datasheet || '')}" placeholder="https://...">
          </div>
          <div class="col-12">
            <label class="form-label small text-secondary">Notes</label>
            <textarea class="form-control form-control-sm bg-dark text-light border-secondary part-input" 
                      data-field="notes" data-index="${idx}" rows="2" placeholder="Additional notes or observations">${escapeHtml(part.notes || '')}</textarea>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setupPartsEventListeners() {
  if (pageEls.partsEditBtn) {
    pageEls.partsEditBtn.addEventListener('click', () => {
      isPartsEditMode = true;
      pageEls.partsEditBtn.classList.add('d-none');
      pageEls.partsSaveBtn.classList.remove('d-none');
      pageEls.partsCancelBtn.classList.remove('d-none');
      updatePartsDisplay();
    });
  }

  if (pageEls.partsSaveBtn) {
    pageEls.partsSaveBtn.addEventListener('click', savePartsData);
  }

  if (pageEls.partsCancelBtn) {
    pageEls.partsCancelBtn.addEventListener('click', () => {
      isPartsEditMode = false;
      currentParts = currentModule.parts || [];
      pageEls.partsEditBtn.classList.remove('d-none');
      pageEls.partsSaveBtn.classList.add('d-none');
      pageEls.partsCancelBtn.classList.add('d-none');
      updatePartsDisplay();
    });
  }

  if (pageEls.partsAddBtn) {
    pageEls.partsAddBtn.addEventListener('click', () => {
      if (!isPartsEditMode) {
        isPartsEditMode = true;
        pageEls.partsEditBtn.classList.add('d-none');
        pageEls.partsSaveBtn.classList.remove('d-none');
        pageEls.partsCancelBtn.classList.remove('d-none');
      }
      currentParts.push({ name: '', type: '', manufacturer: '', model: '', quantity: 1, description: '', datasheet: '', notes: '' });
      updatePartsDisplay();
    });
  }
}

function setupPartEditListeners() {
  document.querySelectorAll('.part-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index);
      const field = e.target.dataset.field;
      const value = e.target.value;
      
      if (currentParts[idx]) {
        if (field === 'quantity') {
          currentParts[idx][field] = parseInt(value) || 0;
        } else {
          currentParts[idx][field] = value;
        }
      }
    });
  });

  document.querySelectorAll('.part-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      if (confirm('Delete this component?')) {
        currentParts.splice(idx, 1);
        updatePartsDisplay();
      }
    });
  });
}

async function savePartsData() {
  try {
    const response = await fetch(`/api/modules/${currentModule.id}/parts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: currentParts })
    });

    if (!response.ok) throw new Error('Failed to save parts data');

    const data = await response.json();
    currentModule.parts = data.parts;
    isPartsEditMode = false;
    pageEls.partsEditBtn.classList.remove('d-none');
    pageEls.partsSaveBtn.classList.add('d-none');
    pageEls.partsCancelBtn.classList.add('d-none');
    updatePartsDisplay();
    alert('✓ Parts data saved successfully!');
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save parts data: ' + err.message);
  }
}

// ── Notes & Information ─────────────────────────────────────────────────────

function renderNotes(m) {
  currentNotes = m.notes || {
    links: [],
    purchaseDate: '',
    quantity: 0,
    projects: [],
    generalNotes: ''
  };
  updateNotesDisplay();
  setupNotesEventListeners();
}

function updateNotesDisplay() {
  if (isNotesEditMode) {
    pageEls.notesContent.innerHTML = renderNotesEdit();
    setupNotesEditListeners();
  } else {
    pageEls.notesContent.innerHTML = renderNotesView();
  }
}

function renderNotesView() {
  const notes = currentNotes;
  const hasData = notes.links?.length > 0 || notes.purchaseDate || notes.quantity > 0 || notes.projects?.length > 0 || notes.generalNotes;

  if (!hasData) {
    return '<div class="text-secondary small text-center py-3">No notes added yet. Click "Edit" to add information.</div>';
  }

  let html = '<div class="notes-sections">';

  // Purchase Information
  if (notes.purchaseDate || notes.quantity > 0) {
    html += `
      <div class="notes-section card bg-black border-secondary mb-3">
        <div class="card-body">
          <h6 class="text-info mb-3">🛒 Purchase Information</h6>
          <div class="row g-2 small">
            ${notes.purchaseDate ? `<div class="col-md-6"><span class="text-secondary">Purchase Date:</span> ${escapeHtml(notes.purchaseDate)}</div>` : ''}
            ${notes.quantity > 0 ? `<div class="col-md-6"><span class="text-secondary">Quantity Available:</span> ${notes.quantity}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // Related Links
  if (notes.links?.length > 0) {
    html += `
      <div class="notes-section card bg-black border-secondary mb-3">
        <div class="card-body">
          <h6 class="text-info mb-3">🔗 Related Links</h6>
          <ul class="list-unstyled mb-0">
    `;
    notes.links.forEach(link => {
      html += `<li class="mb-2"><a href="${escapeHtml(link.url)}" target="_blank" class="text-info">${escapeHtml(link.title || link.url)} →</a></li>`;
    });
    html += `
          </ul>
        </div>
      </div>
    `;
  }

  // Projects
  if (notes.projects?.length > 0) {
    html += `
      <div class="notes-section card bg-black border-secondary mb-3">
        <div class="card-body">
          <h6 class="text-info mb-3">📁 Projects</h6>
          <ul class="list-unstyled mb-0">
    `;
    notes.projects.forEach(project => {
      html += `<li class="mb-2">• ${escapeHtml(project)}</li>`;
    });
    html += `
          </ul>
        </div>
      </div>
    `;
  }

  // General Notes
  if (notes.generalNotes) {
    html += `
      <div class="notes-section card bg-black border-secondary mb-3">
        <div class="card-body">
          <h6 class="text-info mb-3">📝 General Notes</h6>
          <div class="small text-light" style="white-space: pre-wrap;">${escapeHtml(notes.generalNotes)}</div>
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

function renderNotesEdit() {
  const notes = currentNotes;
  return `
    <div class="notes-edit-form">
      <!-- Purchase Information -->
      <div class="card bg-black border-secondary mb-3">
        <div class="card-body">
          <h6 class="text-warning mb-3">🛒 Purchase Information</h6>
          <div class="row g-2">
            <div class="col-md-6">
              <label class="form-label small text-secondary">Purchase Date</label>
              <input type="date" class="form-control form-control-sm bg-dark text-light border-secondary" 
                     id="notes-purchase-date" value="${escapeHtml(notes.purchaseDate || '')}">
            </div>
            <div class="col-md-6">
              <label class="form-label small text-secondary">Quantity Available</label>
              <input type="number" class="form-control form-control-sm bg-dark text-light border-secondary" 
                     id="notes-quantity" value="${notes.quantity || 0}" min="0">
            </div>
          </div>
        </div>
      </div>

      <!-- Related Links -->
      <div class="card bg-black border-secondary mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="text-warning mb-0">🔗 Related Links</h6>
            <button class="btn btn-sm btn-outline-info" id="notes-add-link">➕ Add Link</button>
          </div>
          <div id="notes-links-container">
            ${notes.links?.length > 0 ? notes.links.map((link, idx) => `
              <div class="row g-2 mb-2 link-row" data-index="${idx}">
                <div class="col-md-5">
                  <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary link-title" 
                         value="${escapeHtml(link.title || '')}" placeholder="Link title">
                </div>
                <div class="col-md-6">
                  <input type="url" class="form-control form-control-sm bg-dark text-light border-secondary link-url" 
                         value="${escapeHtml(link.url || '')}" placeholder="https://...">
                </div>
                <div class="col-md-1">
                  <button class="btn btn-sm btn-outline-danger w-100 link-delete" data-index="${idx}">🗑️</button>
                </div>
              </div>
            `).join('') : '<div class="text-secondary small">No links added yet.</div>'}
          </div>
        </div>
      </div>

      <!-- Projects -->
      <div class="card bg-black border-secondary mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="text-warning mb-0">📁 Projects</h6>
            <button class="btn btn-sm btn-outline-info" id="notes-add-project">➕ Add Project</button>
          </div>
          <div id="notes-projects-container">
            ${notes.projects?.length > 0 ? notes.projects.map((project, idx) => `
              <div class="row g-2 mb-2 project-row" data-index="${idx}">
                <div class="col-md-11">
                  <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary project-name" 
                         value="${escapeHtml(project)}" placeholder="Project name">
                </div>
                <div class="col-md-1">
                  <button class="btn btn-sm btn-outline-danger w-100 project-delete" data-index="${idx}">🗑️</button>
                </div>
              </div>
            `).join('') : '<div class="text-secondary small">No projects added yet.</div>'}
          </div>
        </div>
      </div>

      <!-- General Notes -->
      <div class="card bg-black border-secondary mb-3">
        <div class="card-body">
          <h6 class="text-warning mb-3">📝 General Notes</h6>
          <textarea class="form-control bg-dark text-light border-secondary" id="notes-general" rows="6" 
                    placeholder="Add any general notes, observations, or special instructions...">${escapeHtml(notes.generalNotes || '')}</textarea>
        </div>
      </div>
    </div>
  `;
}

function setupNotesEventListeners() {
  if (pageEls.notesEditBtn) {
    pageEls.notesEditBtn.addEventListener('click', () => {
      isNotesEditMode = true;
      pageEls.notesEditBtn.classList.add('d-none');
      pageEls.notesSaveBtn.classList.remove('d-none');
      pageEls.notesCancelBtn.classList.remove('d-none');
      updateNotesDisplay();
    });
  }

  if (pageEls.notesSaveBtn) {
    pageEls.notesSaveBtn.addEventListener('click', saveNotesData);
  }

  if (pageEls.notesCancelBtn) {
    pageEls.notesCancelBtn.addEventListener('click', () => {
      isNotesEditMode = false;
      currentNotes = currentModule.notes || { links: [], purchaseDate: '', quantity: 0, projects: [], generalNotes: '' };
      pageEls.notesEditBtn.classList.remove('d-none');
      pageEls.notesSaveBtn.classList.add('d-none');
      pageEls.notesCancelBtn.classList.add('d-none');
      updateNotesDisplay();
    });
  }
}

function setupNotesEditListeners() {
  // Add link button
  const addLinkBtn = document.getElementById('notes-add-link');
  if (addLinkBtn) {
    addLinkBtn.addEventListener('click', () => {
      if (!currentNotes.links) currentNotes.links = [];
      currentNotes.links.push({ title: '', url: '' });
      updateNotesDisplay();
    });
  }

  // Add project button
  const addProjectBtn = document.getElementById('notes-add-project');
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
      if (!currentNotes.projects) currentNotes.projects = [];
      currentNotes.projects.push('');
      updateNotesDisplay();
    });
  }

  // Purchase date and quantity
  const purchaseDateInput = document.getElementById('notes-purchase-date');
  if (purchaseDateInput) {
    purchaseDateInput.addEventListener('change', (e) => {
      currentNotes.purchaseDate = e.target.value;
    });
  }

  const quantityInput = document.getElementById('notes-quantity');
  if (quantityInput) {
    quantityInput.addEventListener('input', (e) => {
      currentNotes.quantity = parseInt(e.target.value) || 0;
    });
  }

  // Link inputs
  document.querySelectorAll('.link-title').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.closest('.link-row').dataset.index);
      if (currentNotes.links[idx]) {
        currentNotes.links[idx].title = e.target.value;
      }
    });
  });

  document.querySelectorAll('.link-url').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.closest('.link-row').dataset.index);
      if (currentNotes.links[idx]) {
        currentNotes.links[idx].url = e.target.value;
      }
    });
  });

  document.querySelectorAll('.link-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      currentNotes.links.splice(idx, 1);
      updateNotesDisplay();
    });
  });

  // Project inputs
  document.querySelectorAll('.project-name').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.closest('.project-row').dataset.index);
      if (currentNotes.projects[idx] !== undefined) {
        currentNotes.projects[idx] = e.target.value;
      }
    });
  });

  document.querySelectorAll('.project-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      currentNotes.projects.splice(idx, 1);
      updateNotesDisplay();
    });
  });

  // General notes
  const generalNotesInput = document.getElementById('notes-general');
  if (generalNotesInput) {
    generalNotesInput.addEventListener('input', (e) => {
      currentNotes.generalNotes = e.target.value;
    });
  }
}

async function saveNotesData() {
  try {
    const response = await fetch(`/api/modules/${currentModule.id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: currentNotes })
    });

    if (!response.ok) throw new Error('Failed to save notes');

    const data = await response.json();
    currentModule.notes = data.notes;
    isNotesEditMode = false;
    pageEls.notesEditBtn.classList.remove('d-none');
    pageEls.notesSaveBtn.classList.add('d-none');
    pageEls.notesCancelBtn.classList.add('d-none');
    updateNotesDisplay();
    alert('✓ Notes saved successfully!');
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save notes: ' + err.message);
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

function getPinout() {
  // Use module's pinout if available, otherwise default
  // Make a deep copy to avoid mutating the default template
  const pinout = currentModule?.pinout || DEFAULT_ESP8266_PINOUT;
  return JSON.parse(JSON.stringify(pinout));
}

function renderESP8266Pinout() {
  const pinout = getPinout();
  currentPinout = pinout;
  
  const leftPins = pinout.leftPins;
  const rightPins = pinout.rightPins;

  // Adjust for top/bottom view
  let leftDisplay = leftPins;
  let rightDisplay = rightPins;
  let leftDataArray = 'leftPins';
  let rightDataArray = 'rightPins';

  if (currentView === 'top') {
    // Top view: swap sides and keep same top-to-bottom order
    leftDisplay = rightPins;
    rightDisplay = leftPins;
    leftDataArray = 'rightPins';
    rightDataArray = 'leftPins';
  }

  const renderPinRow = (pin, idx, displaySide, dataArray) => {
    const pinNumber = displaySide === 'left' ? idx + 1 : idx + 16;
    
    if (isEditMode) {
      return `
        <div class="gpio-pin-row ${pin.type} editable" data-array="${dataArray}" data-index="${idx}">
          ${displaySide === 'left' ? `<div class="gpio-pin-number">${pinNumber}</div>` : ''}
          ${displaySide === 'left' ? '<div class="gpio-pin-hole"></div>' : ''}
          <div class="gpio-pin-content">
            <div class="gpio-pin-line1">
              <input type="text" class="pin-edit-input pin-label-input" value="${escapeHtml(pin.label)}" data-field="label" />
              <input type="text" class="pin-edit-input pin-gpio-input" value="${escapeHtml(pin.gpio)}" data-field="gpio" />
            </div>
            <div class="gpio-pin-line2">
              <input type="text" class="pin-edit-input pin-notes-input" value="${escapeHtml(pin.notes)}" data-field="notes" />
            </div>
          </div>
          ${displaySide === 'right' ? '<div class="gpio-pin-hole"></div>' : ''}
          ${displaySide === 'right' ? `<div class="gpio-pin-number">${pinNumber}</div>` : ''}
        </div>
      `;
    } else {
      return `
        <div class="gpio-pin-row ${pin.type}">
          ${displaySide === 'left' ? `<div class="gpio-pin-number">${pinNumber}</div>` : ''}
          ${displaySide === 'left' ? '<div class="gpio-pin-hole"></div>' : ''}
          <div class="gpio-pin-content">
            <div class="gpio-pin-line1">
              <span class="gpio-pin-label">${escapeHtml(pin.label)}</span>
              <span class="gpio-pin-gpio">${escapeHtml(pin.gpio)}</span>
            </div>
            <div class="gpio-pin-line2">
              <span class="gpio-pin-notes">${escapeHtml(pin.notes)}</span>
            </div>
          </div>
          ${displaySide === 'right' ? '<div class="gpio-pin-hole"></div>' : ''}
          ${displaySide === 'right' ? `<div class="gpio-pin-number">${pinNumber}</div>` : ''}
        </div>
      `;
    }
  };

  const leftHTML = leftDisplay.map((pin, idx) => renderPinRow(pin, idx, 'left', leftDataArray)).join('');
  const rightHTML = rightDisplay.map((pin, idx) => renderPinRow(pin, idx, 'right', rightDataArray)).join('');

  const viewLabel = currentView === 'bottom' ? 'BOTTOM VIEW' : 'TOP VIEW';

  const toolbarHTML = `
    <div class="pinout-toolbar">
      <button class="btn btn-sm btn-outline-primary" id="copy-json-btn">
        📋 Copy JSON Template
      </button>
      <button class="btn btn-sm btn-outline-success" id="import-json-btn">
        📥 Import JSON
      </button>
      <button class="btn btn-sm ${isEditMode ? 'btn-warning' : 'btn-outline-warning'}" id="edit-mode-btn">
        ${isEditMode ? '✓ Edit Mode' : '✏️ Edit Pinout'}
      </button>
      ${isEditMode ? `
        <button class="btn btn-sm btn-success" id="save-pinout-btn">
          💾 Save Changes
        </button>
        <button class="btn btn-sm btn-outline-secondary" id="cancel-edit-btn">
          ✕ Cancel
        </button>
      ` : ''}
    </div>
  `;

  pageEls.pinoutSchematic.innerHTML = `
    ${toolbarHTML}
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

  // Attach event listeners
  attachPinoutEventListeners();
}

function attachPinoutEventListeners() {
  const copyBtn = document.getElementById('copy-json-btn');
  const importBtn = document.getElementById('import-json-btn');
  const editBtn = document.getElementById('edit-mode-btn');
  const saveBtn = document.getElementById('save-pinout-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');

  if (copyBtn) copyBtn.addEventListener('click', copyJsonTemplate);
  if (importBtn) importBtn.addEventListener('click', importJson);
  if (editBtn) editBtn.addEventListener('click', toggleEditMode);
  if (saveBtn) saveBtn.addEventListener('click', savePinout);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelEdit);

  // Live update currentPinout as user types
  if (isEditMode) {
    const inputs = document.querySelectorAll('.pin-edit-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const row = e.target.closest('.gpio-pin-row');
        const dataArray = row.dataset.array;  // 'leftPins' or 'rightPins'
        const dataIndex = parseInt(row.dataset.index);
        const field = e.target.dataset.field;
        const value = e.target.value;

        const pinArray = currentPinout[dataArray];
        
        if (pinArray && pinArray[dataIndex]) {
          pinArray[dataIndex][field] = value;
        }
      });
    });
  }
}

function copyJsonTemplate() {
  const template = JSON.stringify(getPinout(), null, 2);
  navigator.clipboard.writeText(template).then(() => {
    alert('JSON template copied to clipboard!\n\nYou can now paste this into an LLM and ask it to fill in the data.');
  }).catch(err => {
    console.error('Failed to copy:', err);
    alert('Failed to copy to clipboard');
  });
}

function importJson() {
  const json = prompt('Paste the JSON pinout data here:');
  if (!json) return;

  try {
    const pinout = JSON.parse(json);
    if (!pinout.leftPins || !pinout.rightPins || 
        !Array.isArray(pinout.leftPins) || !Array.isArray(pinout.rightPins)) {
      throw new Error('Invalid pinout structure');
    }

    // Validate pin structure
    const validatePin = (pin) => {
      return pin && 
        typeof pin.label === 'string' && 
        typeof pin.gpio === 'string' && 
        typeof pin.notes === 'string' && 
        ['gpio', 'power', 'ground'].includes(pin.type);
    };

    if (!pinout.leftPins.every(validatePin) || !pinout.rightPins.every(validatePin)) {
      throw new Error('Invalid pin structure');
    }

    currentPinout = pinout;
    currentModule.pinout = pinout;
    savePinoutToServer();
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
}

function toggleEditMode() {
  isEditMode = !isEditMode;
  renderESP8266Pinout();
}

function cancelEdit() {
  isEditMode = false;
  // Reset to saved pinout
  currentPinout = currentModule?.pinout || DEFAULT_ESP8266_PINOUT;
  renderESP8266Pinout();
}

async function savePinout() {
  try {
    const response = await fetch(`/api/modules/${currentModule.id}/pinout`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinout: currentPinout })
    });

    if (!response.ok) throw new Error('Failed to save pinout');

    const data = await response.json();
    currentModule.pinout = data.pinout;
    isEditMode = false;
    renderESP8266Pinout();
    alert('✓ Pinout saved successfully!');
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save pinout: ' + err.message);
  }
}

async function savePinoutToServer() {
  try {
    const response = await fetch(`/api/modules/${currentModule.id}/pinout`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinout: currentPinout })
    });

    if (!response.ok) throw new Error('Failed to save pinout');

    const data = await response.json();
    currentModule.pinout = data.pinout;
    renderESP8266Pinout();
    alert('✓ Pinout imported and saved successfully!');
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save pinout: ' + err.message);
  }
}

// ── Image Carousel & Rotation ───────────────────────────────────────────────

function getCurrentImage() {
  if (!currentModule) return null;
  
  // Try new multi-image array first
  if (currentModule.images && currentModule.images.length > 0) {
    return currentModule.images[currentImageIndex];
  }
  
  // Fall back to legacy single image
  if (currentModule.imageFile) {
    return { filename: currentModule.imageFile, rotation: 0 };
  }
  
  return null;
}

function getImageCount() {
  if (!currentModule) return 0;
  if (currentModule.images) return currentModule.images.length;
  if (currentModule.imageFile) return 1;
  return 0;
}

function updateImageDisplay() {
  const img = getCurrentImage();
  const count = getImageCount();
  
  if (!img) {
    // No images - show placeholder
    pageEls.imageDisplay.innerHTML = moduleThumbnail(currentModule || {});
    pageEls.imageDisplay.className = 'module-image-display';
    pageEls.carouselNav.style.display = 'none';
    pageEls.deleteImageBtn.disabled = true;
    pageEls.setDefaultBtn.disabled = true;
    return;
  }
  
  // Show image
  pageEls.imageDisplay.innerHTML = `<img src="/uploads/${escapeHtml(img.filename)}" alt="Module image">`;
  pageEls.imageDisplay.className = `module-image-display rotate-${img.rotation || 0}`;
  
  // Update carousel controls
  pageEls.carouselCounter.textContent = `${currentImageIndex + 1} / ${count}`;
  pageEls.carouselNav.style.display = count > 1 ? 'flex' : 'none';
  pageEls.carouselPrev.disabled = currentImageIndex === 0;
  pageEls.carouselNext.disabled = currentImageIndex >= count - 1;
  pageEls.deleteImageBtn.disabled = false;
  pageEls.setDefaultBtn.disabled = false;
  
  // Update set-default button appearance
  if (img.isDefault) {
    pageEls.setDefaultBtn.classList.remove('btn-outline-warning');
    pageEls.setDefaultBtn.classList.add('btn-warning');
    pageEls.setDefaultBtn.title = 'This is the default icon image';
  } else {
    pageEls.setDefaultBtn.classList.remove('btn-warning');
    pageEls.setDefaultBtn.classList.add('btn-outline-warning');
    pageEls.setDefaultBtn.title = 'Set as default icon image';
  }
}

function navigateImage(direction) {
  const count = getImageCount();
  if (count === 0) return;
  
  currentImageIndex += direction;
  if (currentImageIndex < 0) currentImageIndex = 0;
  if (currentImageIndex >= count) currentImageIndex = count - 1;
  
  updateImageDisplay();
}

async function setRotation(degrees) {
  const img = getCurrentImage();
  if (!img || !currentModule) return;
  
  try {
    const response = await fetch(`/api/modules/${currentModule.id}/image/${img.filename}/rotation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotation: degrees })
    });
    
    if (!response.ok) throw new Error('Failed to save rotation');
    
    const data = await response.json();
    if (data.images) {
      currentModule.images = data.images;
      updateImageDisplay();
    }
  } catch (err) {
    console.error('Rotation save failed:', err);
    alert('Failed to save rotation');
  }
}

async function uploadImage() {
  const files = pageEls.uploadInput.files;
  if (!files || files.length === 0) return;
  
  pageEls.uploadStatus.textContent = 'Uploading...';
  
  try {
    const formData = new FormData();
    formData.append('image', files[0]);
    
    const response = await fetch(`/api/modules/${currentModule.id}/image`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) throw new Error('Upload failed');
    
    const data = await response.json();
    if (data.images) {
      currentModule.images = data.images;
      currentImageIndex = data.images.length - 1; // Show new image
      updateImageDisplay();
      pageEls.uploadStatus.textContent = '✓ Image added';
      setTimeout(() => pageEls.uploadStatus.textContent = '', 2000);
    }
  } catch (err) {
    console.error('Upload failed:', err);
    pageEls.uploadStatus.textContent = '✗ Upload failed';
    setTimeout(() => pageEls.uploadStatus.textContent = '', 3000);
  }
  
  pageEls.uploadInput.value = '';
}

async function deleteCurrentImage() {
  const img = getCurrentImage();
  if (!img || !currentModule) return;
  
  if (!confirm('Delete this image?')) return;
  
  try {
    const response = await fetch(`/api/modules/${currentModule.id}/image`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: img.filename })
    });
    
    if (!response.ok) throw new Error('Delete failed');
    
    const data = await response.json();
    currentModule.images = data.images || [];
    
    // Adjust index after deletion
    if (currentImageIndex >= currentModule.images.length) {
      currentImageIndex = Math.max(0, currentModule.images.length - 1);
    }
    
    updateImageDisplay();
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Failed to delete image');
  }
}

async function setDefaultImage() {
  const img = getCurrentImage();
  if (!img || !currentModule) return;
  
  // Don't do anything if already default
  if (img.isDefault) return;
  
  try {
    const response = await fetch(`/api/modules/${currentModule.id}/image/${img.filename}/set-default`, {
      method: 'PATCH'
    });
    
    if (!response.ok) throw new Error('Failed to set default');
    
    const data = await response.json();
    if (data.images) {
      currentModule.images = data.images;
      updateImageDisplay();
      pageEls.uploadStatus.textContent = '✓ Default image updated';
      setTimeout(() => pageEls.uploadStatus.textContent = '', 2000);
    }
  } catch (err) {
    console.error('Set default failed:', err);
    alert('Failed to set default image');
  }
}

// ── Initialize ──────────────────────────────────────────────────────────────

// Rotation buttons
pageEls.rotate0.addEventListener('click', () => setRotation(0));
pageEls.rotate90.addEventListener('click', () => setRotation(90));
pageEls.rotate180.addEventListener('click', () => setRotation(180));
pageEls.rotate270.addEventListener('click', () => setRotation(270));

// Carousel navigation
pageEls.carouselPrev.addEventListener('click', () => navigateImage(-1));
pageEls.carouselNext.addEventListener('click', () => navigateImage(1));

// Image upload
pageEls.uploadInput.addEventListener('change', uploadImage);

// Image deletion
pageEls.deleteImageBtn.addEventListener('click', deleteCurrentImage);

// Set default image
pageEls.setDefaultBtn.addEventListener('click', setDefaultImage);

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
