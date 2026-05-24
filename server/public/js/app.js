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

// ─── State ────────────────────────────────────────────────────────────────────

let chart         = null;
let pollTimer     = null;
let infoTimer     = null;
let boardFetchedAt = 0;
let boardUptime   = 0;

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
const RECORD_DURATION_MS = 3000; // 3-second recording at native I2S rate

// ─── DOM refs (resolved once on DOMContentLoaded) ─────────────────────────────

let elStatus, elCurrentDb, elMeter, elChartOverlay, elUptime;
let elRecordBtn, elStopBtn, elReplayBtn, elDownloadBtn, elRecDuration, elRateSelect;

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

  initChart();
  loadSavedConfig();

  document.getElementById('connect-btn').addEventListener('click', onConnectClick);
  document.getElementById('refresh-info-btn').addEventListener('click', () => fetchBoardInfo());
  elRecordBtn.addEventListener('click', startRecording);
  elStopBtn.addEventListener('click',   stopRecording);
  elReplayBtn.addEventListener('click', startReplay);
  elRateSelect.addEventListener('change', () => setSampleRate(parseInt(elRateSelect.value, 10)));
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
  if (ip) {
    document.getElementById('esp32-ip-input').value   = ip;
    document.getElementById('esp32-port-input').value = port;
    // Auto-reconnect on page load if we have a saved IP
    autoConnect(ip, parseInt(port, 10) || 80);
  } else {
    // No saved IP — fetch current server config and auto-connect if set
    autoConnectFromServer();
  }
}

async function autoConnect(ip, port) {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port }),
    });
  } catch { /* ignore — proxy still has .env value */ }
  setStatus('connecting', ip);
  await fetchBoardInfo();
  startPolling();
}

// Fallback: read server config (from .env) and auto-connect if an IP is set
async function autoConnectFromServer() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.ip) {
      document.getElementById('esp32-ip-input').value   = cfg.ip;
      document.getElementById('esp32-port-input').value = String(cfg.port || 80);
      setStatus('connecting', cfg.ip);
      await fetchBoardInfo();
      startPolling();
    }
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

// ─── Recording ────────────────────────────────────────────────────────────────

function startRecording() {
  // Reset old recording
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  audioBlob    = null;
  recordBuffer = [];
  recordStart  = Date.now();

  elRecordBtn.disabled = true;
  elStopBtn.disabled   = false;
  elReplayBtn.disabled = true;
  elDownloadBtn.style.display = 'none';

  stopPolling(); // pause live chart while ESP32 is recording

  // Countdown display
  let remaining = Math.ceil(RECORD_DURATION_MS / 1000);
  elRecDuration.textContent = `● ${remaining}s…`;
  recTimerTick = setInterval(() => {
    remaining--;
    if (remaining > 0) elRecDuration.textContent = `● ${remaining}s…`;
  }, 1000);

  // Fetch WAV from ESP32 via server proxy
  recordAbort = new AbortController();
  fetch(`/api/proxy/audio/record?duration_ms=${RECORD_DURATION_MS}`, {
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
      startPolling(); // resume live chart
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
