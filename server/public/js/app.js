/**
 * ESP32-S3 INMP441 Audio Monitor — Frontend
 *
 * Connects to the desktop server proxy (/api/proxy/*) which forwards
 * requests to the ESP32. No CORS issues this way.
 *
 * Polling cadence: 200 ms for audio level, 30 s for board info refresh.
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS      = 200;   // audio level poll
const INFO_REFRESH_MS       = 30000; // board info refresh
const CHART_WINDOW_POINTS   = 150;   // 30 s at 200 ms/point

// ─── State ────────────────────────────────────────────────────────────────────

let chart         = null;
let pollTimer     = null;
let infoTimer     = null;
let boardFetchedAt = 0;      // timestamp when board info was last fetched
let boardUptime   = 0;       // uptime_ms from the last board fetch

// ─── DOM refs (resolved once on DOMContentLoaded) ─────────────────────────────

let elStatus, elCurrentDb, elMeter, elChartOverlay, elUptime;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  elStatus       = document.getElementById('connection-status');
  elCurrentDb    = document.getElementById('current-db');
  elMeter        = document.getElementById('level-meter');
  elChartOverlay = document.getElementById('chart-overlay');
  elUptime       = document.getElementById('uptime-display');

  initChart();
  loadSavedConfig();

  document.getElementById('connect-btn').addEventListener('click', onConnectClick);
  document.getElementById('refresh-info-btn').addEventListener('click', () => fetchBoardInfo());
});

// ─── Config persistence (localStorage) ───────────────────────────────────────

function loadSavedConfig() {
  const ip   = localStorage.getItem('esp32ip')   || '';
  const port = localStorage.getItem('esp32port') || '80';
  if (ip) {
    document.getElementById('esp32-ip-input').value   = ip;
    document.getElementById('esp32-port-input').value = port;
  }
}

async function onConnectClick() {
  const ip   = document.getElementById('esp32-ip-input').value.trim();
  const port = parseInt(document.getElementById('esp32-port-input').value, 10) || 80;

  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    setStatus('error', 'Invalid IP address');
    return;
  }

  // Save to server
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port }),
    });
    if (!res.ok) {
      const err = await res.json();
      setStatus('error', err.error || 'Config error');
      return;
    }
  } catch {
    setStatus('error', 'Server unreachable');
    return;
  }

  localStorage.setItem('esp32ip', ip);
  localStorage.setItem('esp32port', String(port));

  setStatus('connecting', ip);
  stopPolling();
  await fetchBoardInfo();
  startPolling();
}

// ─── Board info ───────────────────────────────────────────────────────────────

async function fetchBoardInfo() {
  try {
    const res = await fetch('/api/proxy/info');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus('error', data.error || `HTTP ${res.status}`);
      return;
    }
    const info = await res.json();
    renderBoardInfo(info);
    boardFetchedAt = Date.now();
    boardUptime    = info.uptime_ms;
    setStatus('connected', info.ip);

    // Schedule periodic info refresh
    if (!infoTimer) {
      infoTimer = setInterval(fetchBoardInfo, INFO_REFRESH_MS);
    }
  } catch (err) {
    setStatus('error', err.message);
  }
}

function renderBoardInfo(info) {
  setText('info-board',    info.board);
  setText('info-chip',     info.chip_model);
  setText('info-revision', `Rev ${info.chip_revision}`);
  setText('info-cores',    `${info.chip_cores} cores`);
  setText('info-flash',    formatBytes(info.flash_size_bytes));
  setText('info-psram',    info.psram_size_bytes > 0 ? formatBytes(info.psram_size_bytes) : 'None');
  setText('info-heap',     formatBytes(info.free_heap_bytes));
  setText('info-sdk',      info.sdk_version);
  setText('info-fw',       info.firmware_version);
  setText('info-mac',      info.mac);
  setText('info-ssid',     info.ssid);
  setText('info-ip',       info.ip);
  setText('info-rssi',     `${info.rssi_dbm} dBm ${rssiBar(info.rssi_dbm)}`);

  const mic = info.microphone;
  setText('mic-type',      mic.type);
  setText('mic-interface', mic.interface);
  setText('mic-rate',      `${mic.sample_rate.toLocaleString()} Hz`);
  setText('mic-bits',      `${mic.bits}-bit`);
  setText('mic-channel',   mic.channel);
  setText('pin-vdd',       mic.pins.vdd);
  setText('pin-lr',        mic.pins.lr);
  setText('pin-sck',       `GPIO ${mic.pins.sck}`);
  setText('pin-ws',        `GPIO ${mic.pins.ws}`);
  setText('pin-sd',        `GPIO ${mic.pins.sd}`);
}

// ─── Audio polling ────────────────────────────────────────────────────────────

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollAudioLevel, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (infoTimer) { clearInterval(infoTimer); infoTimer = null; }
}

async function pollAudioLevel() {
  try {
    const res = await fetch('/api/proxy/audio/level');
    if (!res.ok) return;
    const data = await res.json();
    updateLevelDisplay(data.db_fs);
    updateChart(data.db_fs);
    updateUptime();
  } catch {
    // silent — keep trying; connection errors are surfaced on the info fetch
  }
}

// ─── Level display ────────────────────────────────────────────────────────────

function updateLevelDisplay(dbfs) {
  elCurrentDb.textContent = Number.isFinite(dbfs) ? dbfs.toFixed(1) : '—';

  // Map −90…0 dBFS → 0…100 %
  const pct = Math.max(0, Math.min(100, ((dbfs + 90) / 90) * 100));
  elMeter.style.width = `${pct}%`;

  const cls = dbfs > -20 ? 'bg-danger'
            : dbfs > -40 ? 'bg-warning'
            :              'bg-success';
  elMeter.className = `progress-bar transition-none ${cls}`;
  elCurrentDb.className = `display-4 fw-bold font-mono ${
    dbfs > -20 ? 'text-danger' : dbfs > -40 ? 'text-warning' : 'text-success'
  }`;
}

// ─── Chart.js ─────────────────────────────────────────────────────────────────

function initChart() {
  const ctx = document.getElementById('audioChart').getContext('2d');
  const emptyData = new Array(CHART_WINDOW_POINTS).fill(null);
  const emptyLabels = new Array(CHART_WINDOW_POINTS).fill('');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: emptyLabels,
      datasets: [{
        label: 'dBFS',
        data: [...emptyData],
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0,255,136,0.08)',
        borderWidth: 1.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        spanGaps: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        y: {
          min: -90,
          max: 0,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#6c757d', callback: (v) => `${v} dB` },
          title: { display: true, text: 'dBFS', color: '#6c757d', font: { size: 11 } },
        },
        x: {
          display: false,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} dBFS`,
          },
        },
      },
    },
  });
}

function updateChart(dbfs) {
  if (!chart) return;

  const ds = chart.data.datasets[0];
  ds.data.push(dbfs);
  if (ds.data.length > CHART_WINDOW_POINTS) ds.data.shift();

  // Dynamic color based on recent max
  const max = Math.max(...ds.data.filter(Number.isFinite));
  const color = max > -20 ? '#ff4444'
              : max > -40 ? '#ffaa00'
              :              '#00ff88';
  ds.borderColor = color;
  ds.backgroundColor = color + '18';

  chart.update('none');
  elChartOverlay.style.display = 'none';
}

// ─── Uptime ───────────────────────────────────────────────────────────────────

function updateUptime() {
  if (!boardFetchedAt) return;
  const elapsed = Date.now() - boardFetchedAt;
  const uptimeMs = boardUptime + elapsed;
  const s  = Math.floor(uptimeMs / 1000) % 60;
  const m  = Math.floor(uptimeMs / 60000) % 60;
  const h  = Math.floor(uptimeMs / 3600000);
  elUptime.textContent = `Uptime: ${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function setStatus(state, detail) {
  const badges = {
    connected:  `<span class="badge bg-success">&#9679; Connected — ${detail}</span>`,
    connecting: `<span class="badge bg-warning text-dark">&#9679; Connecting to ${detail}…</span>`,
    error:      `<span class="badge bg-danger">&#9679; ${detail}</span>`,
  };
  elStatus.innerHTML = badges[state] ?? badges.error;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatBytes(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function rssiBar(rssi) {
  if (rssi >= -60) return '▂▄▆█';
  if (rssi >= -70) return '▂▄▆░';
  if (rssi >= -80) return '▂▄░░';
  return '▂░░░';
}
