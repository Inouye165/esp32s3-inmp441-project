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
const MAX_RECORD_POINTS     = 1500;  // 5 min cap
const RECORD_MAX_MS         = 30000; // matches firmware cap
const RECORD_DEFAULT_MS     = 3000;  // initial selector value

// ─── State ────────────────────────────────────────────────────────────────────

let chart         = null;
let pollTimer     = null;
let infoTimer     = null;
let boardFetchedAt = 0;
let boardUptime   = 0;
let archiveWindowMs = 5 * 60 * 1000;
let archiveWindowEndMs = null;
let archiveChunks = [];
let archiveSelectedMs = null;
let archiveRefreshTimer = null;
let archiveLiveFollow = false;
let archiveLiveFollowTimer = null;
let archiveLiveChunkId = null;

// Recording state
let recordBuffer  = [];   // [{ts, db}] computed from WAV for visual chart replay
let isRecording   = false;
let recordStart   = 0;
let replayTimer   = null;
let recTimerTick  = null;
// Audio state (actual WAV from ESP32)
let audioBlob     = null;  // Blob containing recorded WAV
let audioUrl      = null;  // object URL for the WAV blob
let currentAudio  = null;  // currently playing Audio element
let recordAbort   = null;  // AbortController for in-progress recording fetch
// Recording duration is user-selectable via #rec-duration-select.

// Live-waveform SSE state. When the ESP32 is busy serving the next archive
// chunk the direct /api/proxy/audio/level endpoint stops responding, so we
// also subscribe to a server-side feed derived from the saved archive chunks
// and drip those samples into the chart at the chart's native cadence so it
// keeps moving smoothly even while the board is locked.
let liveSampleSource = null;     // EventSource
let liveSampleBuffer = [];       // pending samples to drip into the chart
let liveSampleTimer  = null;     // setInterval handle
let lastDirectLevelAt = 0;       // when /proxy/audio/level last succeeded

// ─── DOM refs (resolved once on DOMContentLoaded) ─────────────────────────────

let elStatus, elCurrentDb, elMeter, elChartOverlay, elUptime;
let elRecordBtn, elStopBtn, elReplayBtn, elDownloadBtn, elRecDuration, elRateSelect, elDurationSelect;
let elArchiveStatusBadge, elArchiveStartBtn, elArchiveStopBtn, elArchiveLiveBtn;
let elArchiveOlderBtn, elArchiveNewerBtn, elArchiveLatestBtn, elArchiveSlider;
let elArchiveRangeStart, elArchiveRangeEnd, elArchiveSelectedTime, elArchiveWindowLabel;
let elArchiveBars, elArchiveChunkList, elArchivePlaySelectionBtn, elArchiveAudio;
let elArchiveDurationSelect, elArchiveDownloadBtn;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  elStatus       = document.getElementById('connection-status');
  elCurrentDb    = document.getElementById('current-db');
  elMeter        = document.getElementById('level-meter');
  elChartOverlay = document.getElementById('chart-overlay');
  elUptime       = document.getElementById('uptime-display');
  elRecordBtn    = document.getElementById('record-btn');
  elStopBtn      = document.getElementById('stop-btn');
  elReplayBtn    = document.getElementById('replay-btn');
  elDownloadBtn  = document.getElementById('download-btn');
  elRecDuration  = document.getElementById('rec-duration');
  elRateSelect   = document.getElementById('sample-rate-select');
  elDurationSelect = document.getElementById('rec-duration-select');
  elArchiveStatusBadge = document.getElementById('archive-status-badge');
  elArchiveStartBtn = document.getElementById('archive-start-btn');
  elArchiveStopBtn = document.getElementById('archive-stop-btn');
  elArchiveLiveBtn = document.getElementById('archive-live-btn');
  elArchiveOlderBtn = document.getElementById('archive-older-btn');
  elArchiveNewerBtn = document.getElementById('archive-newer-btn');
  elArchiveLatestBtn = document.getElementById('archive-latest-btn');
  elArchiveSlider = document.getElementById('archive-point-slider');
  elArchiveRangeStart = document.getElementById('archive-range-start');
  elArchiveRangeEnd = document.getElementById('archive-range-end');
  elArchiveSelectedTime = document.getElementById('archive-selected-time');
  elArchiveWindowLabel = document.getElementById('archive-window-label');
  elArchiveBars = document.getElementById('archive-chunk-bars');
  elArchiveChunkList = document.getElementById('archive-chunk-list');
  elArchivePlaySelectionBtn = document.getElementById('archive-play-selection-btn');
  elArchiveAudio = document.getElementById('archive-audio');
  elArchiveDurationSelect = document.getElementById('archive-duration-select');
  elArchiveDownloadBtn = document.getElementById('archive-download-btn');

  initChart();
  loadSavedConfig();
  refreshArchiveStatus();
  archiveRefreshTimer = setInterval(refreshArchiveStatus, 15000);
  connectLiveSampleStream();

  document.getElementById('connect-btn').addEventListener('click', onConnectClick);
  document.getElementById('refresh-info-btn').addEventListener('click', () => fetchBoardInfo());
  elRecordBtn.addEventListener('click', startRecording);
  elStopBtn.addEventListener('click',   stopRecording);
  elReplayBtn.addEventListener('click', startReplay);
  elRateSelect.addEventListener('change', () => setSampleRate(parseInt(elRateSelect.value, 10)));
  elArchiveStartBtn.addEventListener('click', () => toggleArchive(true));
  elArchiveStopBtn.addEventListener('click', () => toggleArchive(false));
  elArchiveLiveBtn.addEventListener('click', toggleArchiveLiveFollow);
  elArchiveOlderBtn.addEventListener('click', () => shiftArchiveWindow(-1));
  elArchiveNewerBtn.addEventListener('click', () => shiftArchiveWindow(1));
  elArchiveLatestBtn.addEventListener('click', () => {
    archiveWindowEndMs = null;
    refreshArchiveStatus();
  });
  elArchiveSlider.addEventListener('input', onArchiveSliderInput);
  elArchivePlaySelectionBtn.addEventListener('click', () => playArchiveSelection());
  elArchiveDownloadBtn.addEventListener('click', () => downloadArchiveSelection());
  elArchiveDurationSelect.addEventListener('change', updateSelectionSummary);
  document.querySelectorAll('.archive-window-btn').forEach((button) => {
    button.addEventListener('click', () => {
      archiveWindowMs = parseInt(button.dataset.windowMs || String(5 * 60 * 1000), 10);
      archiveWindowEndMs = null;
      refreshArchiveStatus();
    });
  });
});

// ─── Safe localStorage wrapper (Edge Tracking Prevention safe) ───────────────

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* blocked by Tracking Prevention */ }
}

// ─── Config persistence ───────────────────────────────────────────────────────

function loadSavedConfig() {
  const ip   = storageGet('esp32ip')   || '';
  const port = storageGet('esp32port') || '80';
  document.getElementById('esp32-ip-input').value   = ip;
  document.getElementById('esp32-port-input').value = port;
  // Prefer the server's current runtime config over browser localStorage.
  // localStorage is per-browser and can go stale after swapping hardware.
  autoConnectFromServer(ip, parseInt(port, 10) || 80);
}

async function autoConnect(ip, port) {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port }),
    });
  } catch { /* ignore — proxy still has .env value */ }
  ensureInfoRefreshTimer();
  setStatus('connecting', ip);
  await fetchBoardInfo();
  startPolling();
}

// Fallback: read server config (from .env) and auto-connect if an IP is set
async function autoConnectFromServer(fallbackIp = '', fallbackPort = 80) {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    const chosenIp = cfg.ip || fallbackIp;
    const chosenPort = Number(cfg.port || fallbackPort || 80);
    if (!chosenIp) return;

    document.getElementById('esp32-ip-input').value   = chosenIp;
    document.getElementById('esp32-port-input').value = String(chosenPort);
    storageSet('esp32ip', chosenIp);
    storageSet('esp32port', String(chosenPort));
    ensureInfoRefreshTimer();
    setStatus('connecting', chosenIp);
    await fetchBoardInfo();
    startPolling();
  } catch { /* server not ready yet */ }
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

  storageSet('esp32ip', ip);
  storageSet('esp32port', String(port));

  ensureInfoRefreshTimer();
  setStatus('connecting', ip);
  stopPolling();
  await fetchBoardInfo();
  startPolling();
}

function ensureInfoRefreshTimer() {
  if (!infoTimer) {
    infoTimer = setInterval(fetchBoardInfo, INFO_REFRESH_MS);
  }
}

// ─── Board info ───────────────────────────────────────────────────────────────

let fetchBoardInfoInflight = false;
async function fetchBoardInfo() {
  if (fetchBoardInfoInflight) return; // prevent socket pile-up
  fetchBoardInfoInflight = true;
  try {
    const res = await fetch('/api/proxy/info');
    if (!res.ok) {
      // 503 = ESP32 busy; just stay quiet (board info is non-essential).
      if (res.status === 503) return;
      const data = await res.json().catch(() => ({}));
      setStatus('error', data.error || `HTTP ${res.status}`);
      return;
    }
    const info = await res.json();
    renderBoardInfo(info);
    boardFetchedAt = Date.now();
    boardUptime    = info.uptime_ms;
    if (!info.stale) setStatus('connected', info.ip);
  } catch (err) {
    if ((err.message || '').includes('aborted')) return;
    setStatus('error', err.message);
  } finally {
    fetchBoardInfoInflight = false;
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

  // Sync sample rate selector
  if (elRateSelect) {
    elRateSelect.value   = String(mic.sample_rate);
    elRateSelect.disabled = false;
  }
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

let pollAudioLevelInflight = false;
async function pollAudioLevel() {
  // Skip if previous request is still in flight. Without this guard, when
  // the ESP32 is busy the server takes 200–2000 ms per response, and we'd
  // queue dozens of requests/sec — eventually Chrome refuses new sockets
  // (`net::ERR_INSUFFICIENT_RESOURCES`), which also blocks audio playback.
  if (pollAudioLevelInflight) return;
  pollAudioLevelInflight = true;
  try {
    const res = await fetch('/api/proxy/audio/level');
    if (!res.ok) return;
    const data = await res.json();
    // Server returns `stale: true` when the ESP32 is locked out by an
    // archive recording. Skip the chart update — the SSE feed handles it.
    if (data.stale) return;
    lastDirectLevelAt = Date.now();
    updateLevelDisplay(data.db_fs);
    updateChart(data.db_fs);
    updateUptime();
  } catch {
    // silent — keep trying; connection errors are surfaced on the info fetch
  } finally {
    pollAudioLevelInflight = false;
  }
}

// ─── Live-sample SSE fallback ─────────────────────────────────────────────────
// The server emits dBFS samples (computed from each saved archive chunk) via
// /api/archive/stream. We buffer incoming bursts and drip them into the chart
// at POLL_INTERVAL_MS pacing so the waveform stays smooth even while the
// ESP32 /audio/level endpoint is locked out by an in-flight record request.

function connectLiveSampleStream() {
  if (liveSampleSource) return;
  try {
    liveSampleSource = new EventSource('/api/archive/stream');
  } catch {
    return;
  }
  liveSampleSource.addEventListener('samples', (evt) => {
    try {
      const parsed = JSON.parse(evt.data);
      if (Array.isArray(parsed)) {
        for (const sample of parsed) {
          if (sample && typeof sample.db_fs === 'number') {
            liveSampleBuffer.push(sample.db_fs);
          }
        }
        if (liveSampleBuffer.length > 600) {
          liveSampleBuffer.splice(0, liveSampleBuffer.length - 600);
        }
        ensureLiveSampleTimer();
      }
    } catch { /* ignore malformed message */ }
  });
  liveSampleSource.onerror = () => {
    // EventSource auto-reconnects; nothing to do.
  };
}

function ensureLiveSampleTimer() {
  if (liveSampleTimer) return;
  liveSampleTimer = setInterval(() => {
    if (liveSampleBuffer.length === 0) {
      clearInterval(liveSampleTimer);
      liveSampleTimer = null;
      return;
    }
    // Skip if the direct ESP32 poll updated the chart recently — direct data
    // is always preferred when available.
    if (Date.now() - lastDirectLevelAt < POLL_INTERVAL_MS * 2) {
      liveSampleBuffer.shift();
      return;
    }
    const db = liveSampleBuffer.shift();
    if (Number.isFinite(db)) {
      updateLevelDisplay(db);
      updateChart(db);
    }
  }, POLL_INTERVAL_MS);
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
  const emptyData   = new Array(CHART_WINDOW_POINTS).fill(null);
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
      onClick: (evt, _items, chartInstance) => {
        // Map click x → timestamp. Each chart slot is POLL_INTERVAL_MS apart;
        // the rightmost slot is “now”. Use this as a quick way to pick a
        // start point in the very recent past without touching the slider.
        const xScale = chartInstance.scales?.x;
        if (!xScale) return;
        const idx = Math.round(xScale.getValueForPixel(evt.x));
        if (!Number.isFinite(idx)) return;
        const slotsFromNow = (CHART_WINDOW_POINTS - 1) - clamp(idx, 0, CHART_WINDOW_POINTS - 1);
        const targetMs = Date.now() - slotsFromNow * POLL_INTERVAL_MS;
        const minMs = elArchiveSlider ? Number(elArchiveSlider.min) : 0;
        const maxMs = elArchiveSlider ? Number(elArchiveSlider.max) : targetMs;
        if (!minMs || !maxMs) return;
        archiveSelectedMs = clamp(targetMs, minMs, maxMs);
        if (elArchiveSlider) elArchiveSlider.value = String(archiveSelectedMs);
        updateSelectionSummary();
        renderArchiveBars();
      },
      scales: {
        y: {
          // 0 dBFS at top = loudest; −90 dBFS at bottom = silence (louder → up)
          min: -90,
          max: 0,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#6c757d', callback: (v) => `${v} dB` },
          title: { display: true, text: 'Loud ↑  dBFS  ↓ Quiet', color: '#6c757d', font: { size: 11 } },
        },
        x: { display: false },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} dBFS`,
          },
        },
        annotation: {
          annotations: {
            // Coloured background zones
            quietZone: {
              type: 'box', yMin: -90, yMax: -40,
              backgroundColor: 'rgba(0,255,136,0.06)', borderWidth: 0,
            },
            moderateZone: {
              type: 'box', yMin: -40, yMax: -20,
              backgroundColor: 'rgba(255,170,0,0.06)', borderWidth: 0,
            },
            loudZone: {
              type: 'box', yMin: -20, yMax: 0,
              backgroundColor: 'rgba(255,68,68,0.08)', borderWidth: 0,
            },
            // Threshold lines
            quietLine: {
              type: 'line', yMin: -40, yMax: -40,
              borderColor: 'rgba(0,255,136,0.55)', borderWidth: 1,
              borderDash: [6, 3],
              label: {
                display: true, content: '−40 dB', position: 'end',
                color: '#00ff88', backgroundColor: 'transparent',
                font: { size: 10 },
              },
            },
            loudLine: {
              type: 'line', yMin: -20, yMax: -20,
              borderColor: 'rgba(255,68,68,0.55)', borderWidth: 1,
              borderDash: [6, 3],
              label: {
                display: true, content: '−20 dB', position: 'end',
                color: '#ff4444', backgroundColor: 'transparent',
                font: { size: 10 },
              },
            },
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

function formatDateTime(ts) {
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function refreshArchiveStatus() {
  try {
    const res = await fetch('/api/archive/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const status = await res.json();
    renderArchiveStatus(status);
    if (archiveWindowEndMs === null) archiveWindowEndMs = status.latest_end_ms;
    await loadArchiveChunks();
  } catch (err) {
    elArchiveStatusBadge.className = 'badge bg-danger';
    elArchiveStatusBadge.textContent = `Archive error: ${err.message}`;
  }
}

function renderArchiveStatus(status) {
  const stateClass = status.enabled ? (status.capturing ? 'bg-success' : 'bg-warning text-dark') : 'bg-secondary';
  const stateText = status.enabled
    ? (status.capturing ? `Recording ${Math.round(status.chunk_ms / 1000)}s chunks` : 'Archive idle')
    : 'Archive stopped';
  elArchiveStatusBadge.className = `badge ${stateClass}`;
  elArchiveStatusBadge.textContent = stateText;
  elArchiveStartBtn.disabled = status.enabled;
  elArchiveStopBtn.disabled = !status.enabled;
}

async function loadArchiveChunks() {
  const params = new URLSearchParams({ window_ms: String(archiveWindowMs) });
  if (archiveWindowEndMs) params.set('end_ms', String(archiveWindowEndMs));
  const res = await fetch(`/api/archive/chunks?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  archiveChunks = data.chunks || [];
  if (archiveWindowEndMs === null && data.latest_end_ms) archiveWindowEndMs = data.latest_end_ms;
  renderArchiveWindow(data);
  if (archiveLiveFollow) maybeAdvanceLiveFollow();
}

function renderArchiveWindow(data) {
  const rangeStart = archiveChunks[0]?.start_ms ?? null;
  const rangeEnd = archiveChunks[archiveChunks.length - 1]?.end_ms ?? null;

  if (!rangeStart || !rangeEnd) {
    elArchiveSlider.disabled = true;
    elArchiveSlider.min = '0';
    elArchiveSlider.max = '0';
    elArchiveSlider.value = '0';
    elArchiveRangeStart.textContent = '—';
    elArchiveRangeEnd.textContent = '—';
    elArchiveSelectedTime.textContent = 'No archived audio yet';
    elArchiveWindowLabel.textContent = `Waiting for first ${Math.round(data.chunk_ms / 1000)}s archive chunk`;
    elArchiveBars.innerHTML = '';
    elArchiveChunkList.innerHTML = '';
    elArchivePlaySelectionBtn.disabled = true;
    if (elArchiveDownloadBtn) elArchiveDownloadBtn.disabled = true;
    return;
  }

  if (archiveSelectedMs === null || archiveSelectedMs < rangeStart || archiveSelectedMs > rangeEnd) {
    archiveSelectedMs = rangeEnd;
  }

  elArchiveSlider.disabled = false;
  elArchiveSlider.min = String(rangeStart);
  elArchiveSlider.max = String(rangeEnd);
  elArchiveSlider.value = String(clamp(archiveSelectedMs, rangeStart, rangeEnd));
  elArchiveRangeStart.textContent = formatDateTime(rangeStart);
  elArchiveRangeEnd.textContent = formatDateTime(rangeEnd);
  updateSelectionSummary();
  elArchiveWindowLabel.textContent = `${archiveChunks.length} chunks loaded • ${formatDuration(rangeEnd - rangeStart)}`;
  elArchivePlaySelectionBtn.disabled = false;
  if (elArchiveDownloadBtn) elArchiveDownloadBtn.disabled = false;

  renderArchiveBars();
  renderArchiveChunkList();
}

function renderArchiveBars() {
  elArchiveBars.innerHTML = '';
  archiveChunks.forEach((chunk) => {
    const button = document.createElement('button');
    const intensity = clamp(((chunk.peak_dbfs + 90) / 90) * 100, 10, 100);
    button.type = 'button';
    button.className = `archive-bar${archiveSelectedMs !== null && archiveSelectedMs >= chunk.start_ms && archiveSelectedMs <= chunk.end_ms ? ' is-selected' : ''}`;
    button.style.height = `${intensity}%`;
    button.title = `${formatDateTime(chunk.start_ms)} • ${formatDuration(chunk.duration_ms)} • peak ${chunk.peak_dbfs.toFixed(1)} dBFS`;
    button.addEventListener('click', () => {
      archiveSelectedMs = chunk.start_ms;
      elArchiveSlider.value = String(chunk.start_ms);
      onArchiveSliderInput();
    });
    elArchiveBars.appendChild(button);
  });
}

function renderArchiveChunkList() {
  // Compact summary list (no per-chunk button). The user plays/downloads
  // arbitrary ranges via the duration selector above, so we don't need a
  // button per 2-second clip.
  elArchiveChunkList.innerHTML = '';
  const recent = archiveChunks.slice(-12).reverse();
  recent.forEach((chunk) => {
    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between gap-2 py-1 border-bottom border-secondary-subtle';
    row.innerHTML = `<span>${formatDateTime(chunk.start_ms)}</span>`
                  + `<span class="text-secondary">${formatDuration(chunk.duration_ms)} • peak ${chunk.peak_dbfs.toFixed(1)} dBFS</span>`;
    elArchiveChunkList.appendChild(row);
  });
}

function onArchiveSliderInput() {
  archiveSelectedMs = Number(elArchiveSlider.value);
  updateSelectionSummary();
  renderArchiveBars();
}

function getSelectionRange() {
  if (archiveSelectedMs === null) return null;
  const durationMs = parseInt(elArchiveDurationSelect?.value || '60000', 10);
  const earliest = archiveChunks[0]?.start_ms ?? archiveSelectedMs;
  const latest = archiveChunks[archiveChunks.length - 1]?.end_ms ?? archiveSelectedMs;
  // If the requested duration runs past the end of the archive, shift the
  // start back so the user still gets a clip of the requested length
  // (clamped by the earliest available chunk).
  let start = archiveSelectedMs;
  let end = start + durationMs;
  if (end > latest) {
    end = latest;
    start = Math.max(earliest, end - durationMs);
  }
  if (end <= start) return null;
  return { start, end, durationMs: end - start };
}

function updateSelectionSummary() {
  const range = getSelectionRange();
  if (!range) {
    elArchiveSelectedTime.textContent = `Selected: ${formatDateTime(archiveSelectedMs)}`;
    return;
  }
  elArchiveSelectedTime.textContent =
    `${formatDateTime(range.start)} → ${formatDateTime(range.end)} (${formatDuration(range.durationMs)})`;
}

function findArchiveChunkAt(timeMs) {
  return archiveChunks.find((chunk) => timeMs >= chunk.start_ms && timeMs < chunk.end_ms)
    || archiveChunks.find((chunk) => timeMs <= chunk.end_ms)
    || archiveChunks[archiveChunks.length - 1]
    || null;
}

function playArchiveChunk(chunk, offsetSeconds) {
  archiveLiveChunkId = chunk.id;
  const audio = elArchiveAudio;
  const url = `/api/archive/audio/${encodeURIComponent(chunk.id)}`;
  // Only reset src when actually switching chunks — re-setting the same src
  // forces a reload that aborts the current play() and is the main reason
  // "replay" sometimes did nothing.
  if (audio.src !== new URL(url, window.location.href).href) {
    audio.onloadedmetadata = null;
    audio.onerror = null;
    audio.src = url;
  }
  // Apply seek lazily once metadata is known. If metadata is already loaded
  // (HAVE_METADATA=1+), seek immediately.
  const applyOffset = () => {
    const dur = audio.duration;
    if (Number.isFinite(dur) && dur > 0) {
      audio.currentTime = clamp(offsetSeconds, 0, Math.max(0, dur - 0.05));
    }
  };
  if (audio.readyState >= 1) applyOffset();
  else audio.onloadedmetadata = applyOffset;

  audio.onerror = () => {
    const code = audio.error?.code ?? '?';
    const msg = audio.error?.message ?? '';
    elArchiveSelectedTime.textContent = `Playback error (MediaError ${code}${msg ? ': ' + msg : ''})`;
  };

  // Call play() synchronously so the click's user-gesture token is honored.
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((err) => {
      // AbortError is normal when the user clicks quickly between chunks.
      if (err.name === 'AbortError') return;
      elArchiveSelectedTime.textContent = `Playback blocked: ${err.message || err.name}`;
    });
  }
}

function playArchiveSelection() {
  const range = getSelectionRange();
  if (!range) return;
  archiveLiveFollow = false;
  if (archiveLiveFollowTimer) {
    clearInterval(archiveLiveFollowTimer);
    archiveLiveFollowTimer = null;
  }
  elArchiveLiveBtn.textContent = 'Play Live';

  const audio = elArchiveAudio;
  const url = `/api/archive/audio-range?start_ms=${range.start}&end_ms=${range.end}`;
  const absUrl = new URL(url, window.location.href).href;
  if (audio.src !== absUrl) {
    audio.onerror = null;
    audio.src = url;
  } else {
    // Same range re-clicked → restart from the beginning.
    try { audio.currentTime = 0; } catch { /* not yet loaded */ }
  }
  audio.onerror = () => {
    const code = audio.error?.code ?? '?';
    elArchiveSelectedTime.textContent = `Playback error (MediaError ${code})`;
  };
  const p = audio.play();
  if (p && typeof p.catch === 'function') {
    p.catch((err) => {
      if (err.name === 'AbortError') return;
      elArchiveSelectedTime.textContent = `Playback blocked: ${err.message || err.name}`;
    });
  }
}

function downloadArchiveSelection() {
  const range = getSelectionRange();
  if (!range) return;
  // Use a temporary anchor; the server sets Content-Disposition so the
  // browser saves with a sensible esp32-<start>-to-<end>.wav filename.
  const a = document.createElement('a');
  a.href = `/api/archive/audio-range?start_ms=${range.start}&end_ms=${range.end}&download=1`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function toggleArchive(enabled) {
  const endpoint = enabled ? '/api/archive/start' : '/api/archive/stop';
  await fetch(endpoint, { method: 'POST' });
  await refreshArchiveStatus();
}

function shiftArchiveWindow(direction) {
  if (!archiveWindowEndMs) return;
  archiveWindowEndMs += direction * archiveWindowMs;
  archiveLiveFollow = false;
  elArchiveLiveBtn.textContent = 'Play Live';
  refreshArchiveStatus();
}

function toggleArchiveLiveFollow() {
  archiveLiveFollow = !archiveLiveFollow;
  elArchiveLiveBtn.textContent = archiveLiveFollow ? 'Stop Live' : 'Play Live';
  if (!archiveLiveFollow) {
    if (archiveLiveFollowTimer) clearInterval(archiveLiveFollowTimer);
    archiveLiveFollowTimer = null;
    return;
  }
  archiveWindowEndMs = null;
  maybeAdvanceLiveFollow();
  archiveLiveFollowTimer = setInterval(() => {
    refreshArchiveStatus();
  }, 5000);
}

function maybeAdvanceLiveFollow() {
  const latest = archiveChunks[archiveChunks.length - 1];
  if (!latest || latest.id === archiveLiveChunkId) return;
  playArchiveChunk(latest, 0);
}

// ─── Recording ────────────────────────────────────────────────────────────────

function startRecording() {
  // Reset old recording
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  audioBlob    = null;
  recordBuffer = [];
  recordStart  = Date.now();

  const durationMs = Math.min(RECORD_MAX_MS, Math.max(500,
    parseInt(elDurationSelect?.value ?? String(RECORD_DEFAULT_MS), 10) || RECORD_DEFAULT_MS));

  elRecordBtn.disabled = true;
  elStopBtn.disabled   = false;
  elReplayBtn.disabled = true;
  elDownloadBtn.style.display = 'none';

  // NOTE: we intentionally do NOT call stopPolling() here. The ESP32 firmware
  // pauses its live micTask while it owns I2S for the WAV stream, so the
  // /api/audio/level endpoint just returns the cached last value — the chart
  // will flatline during the recording, which is more honest than blanking it.

  // Countdown display
  let remaining = Math.ceil(durationMs / 1000);
  elRecDuration.textContent = `● ${remaining}s…`;
  recTimerTick = setInterval(() => {
    remaining--;
    if (remaining > 0) elRecDuration.textContent = `● ${remaining}s…`;
  }, 1000);

  // Fetch WAV from ESP32 via server proxy
  recordAbort = new AbortController();
  fetch(`/api/proxy/audio/record?duration_ms=${durationMs}`, {
    signal: recordAbort.signal,
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then(wavData => {
      audioBlob = new Blob([wavData], { type: 'audio/wav' });
      audioUrl  = URL.createObjectURL(audioBlob);
      // Compute dBFS timeline from WAV for visual chart replay
      recordBuffer = computeDbfsFromWav(wavData);
      const kb = (wavData.byteLength / 1024).toFixed(0);
      elRecDuration.textContent = `${kb} KB / ${recordBuffer.length} pts — click Replay`;
      elReplayBtn.disabled = false;
      // Show download link so the WAV can be verified outside the browser
      elDownloadBtn.href     = audioUrl;
      elDownloadBtn.download = 'recording.wav';
      elDownloadBtn.style.display = '';
    })
    .catch(err => {
      if (err.name !== 'AbortError') {
        elRecDuration.textContent = `⚠ Recording failed: ${err.message}`;
      }
    })
    .finally(() => {
      clearInterval(recTimerTick);
      recordAbort  = null;
      isRecording  = false;
      elRecordBtn.disabled = false;
      elStopBtn.disabled   = true;
      // Polling was never stopped; nothing to resume.
    });
}

function stopRecording() {
  if (recordAbort) {
    recordAbort.abort();
    recordAbort = null;
    elRecDuration.textContent = 'Recording cancelled';
  }
  clearInterval(recTimerTick);
  isRecording  = false;
  elRecordBtn.disabled = false;
  elStopBtn.disabled   = true;
  elReplayBtn.disabled = !audioUrl;
}

function startReplay() {
  if (!audioUrl) return;
  stopPolling();

  // Clear chart so recorded waveform appears from the start
  if (chart) {
    chart.data.datasets[0].data = new Array(CHART_WINDOW_POINTS).fill(null);
    chart.update('none');
  }

  elReplayBtn.disabled = true;
  elRecordBtn.disabled = true;
  elRecDuration.textContent = '▶ Playing…';

  // Play audio
  currentAudio = new Audio(audioUrl);
  currentAudio.onended = () => stopReplay();
  currentAudio.onerror = () => {
    const code = currentAudio?.error?.code ?? '?';
    const msg  = currentAudio?.error?.message ?? '';
    elRecDuration.textContent = `⚠ Audio error (MediaError ${code}${msg ? ': ' + msg : ''}) — try ↓WAV`;
    stopReplay();
  };
  currentAudio.play().catch(err => {
    elRecDuration.textContent = `⚠ Playback blocked: ${err.message} — try ↓WAV`;
    stopReplay();
  });

  // Visual chart replay from dBFS timeline computed from WAV
  let i = 0;
  replayTimer = setInterval(() => {
    if (i >= recordBuffer.length) return; // let audio.onended handle stop
    const entry = recordBuffer[i++];
    if (entry.db !== null) updateLevelDisplay(entry.db);
    updateChart(entry.db);
  }, POLL_INTERVAL_MS);
}

function stopReplay() {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.pause();
    currentAudio = null;
  }
  clearInterval(replayTimer);
  replayTimer = null;
  elReplayBtn.disabled = !audioUrl;
  elRecordBtn.disabled = false;
  const kb = audioBlob ? `${(audioBlob.size / 1024).toFixed(0)} KB — click Replay` : '';
  elRecDuration.textContent = kb;
  startPolling();
}

// ─── WAV → dBFS timeline (for visual chart during replay) ────────────────────

function computeDbfsFromWav(arrayBuffer) {
  const view        = new DataView(arrayBuffer);
  const sampleRate  = view.getUint32(24, true);
  const dataBytes   = view.getUint32(40, true);
  const pcm         = new Int16Array(arrayBuffer, 44, dataBytes / 2);
  const chunkSamp   = Math.round(sampleRate * POLL_INTERVAL_MS / 1000);
  const result      = [];
  for (let i = 0; i < pcm.length; i += chunkSamp) {
    let sumSq = 0;
    const end = Math.min(i + chunkSamp, pcm.length);
    for (let j = i; j < end; j++) {
      const s = pcm[j] / 32768.0;
      sumSq += s * s;
    }
    const rms  = Math.sqrt(sumSq / (end - i));
    const dbfs = rms > 1e-10 ? 20 * Math.log10(rms) : -90;
    result.push({ ts: i * 1000 / sampleRate, db: Math.max(-90, Math.min(0, dbfs)) });
  }
  return result;
}

// ─── Sample rate ──────────────────────────────────────────────────────────────

async function setSampleRate(rate) {
  try {
    const res = await fetch('/api/proxy/audio/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample_rate: rate }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`Sample rate change failed: ${data.error || res.status}`);
      await fetchBoardInfo(); // refresh to restore correct displayed value
      return;
    }
    // Update the wiring table display to match new rate
    setText('mic-rate', `${data.sample_rate.toLocaleString()} Hz`);
  } catch (err) {
    alert(`Could not reach server: ${err.message}`);
  }
}
