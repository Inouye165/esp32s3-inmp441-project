'use strict';

const MAX_POINTS = 600; // ~10 minutes at 1 sample/sec

const els = {
  boardStatus: document.getElementById('board-status'),
  ingestStatus: document.getElementById('ingest-status'),
  ipInput: document.getElementById('esp32-ip-input'),
  portInput: document.getElementById('esp32-port-input'),
  saveBtn: document.getElementById('save-config-btn'),
  configMsg: document.getElementById('config-msg'),
  infoChip: document.getElementById('info-chip'),
  infoFw: document.getElementById('info-fw'),
  infoIp: document.getElementById('info-ip'),
  infoRssi: document.getElementById('info-rssi'),
  infoStreaming: document.getElementById('info-streaming'),
  infoSr: document.getElementById('info-sr'),
  levelValue: document.getElementById('level-value'),
  startBtn: document.getElementById('start-btn'),
  stopBtn: document.getElementById('stop-btn'),
  ingestPort: document.getElementById('ingest-port'),
  ingestClient: document.getElementById('ingest-client'),
  ingestBytes: document.getElementById('ingest-bytes'),
  streamMsg: document.getElementById('stream-msg'),
};

// --- Chart -----------------------------------------------------------------

const chart = new Chart(document.getElementById('wave-chart').getContext('2d'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'dBFS',
      data: [],
      borderColor: '#4ade80',
      backgroundColor: 'rgba(74,222,128,0.15)',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.2,
      fill: true,
    }],
  },
  options: {
    animation: false,
    responsive: true,
    scales: {
      x: { display: false },
      y: { min: -90, max: 0, ticks: { color: '#9aa3ad' }, grid: { color: '#2c333b' } },
    },
    plugins: { legend: { display: false } },
  },
});

function pushSample(s) {
  const t = new Date(s.t_ms).toLocaleTimeString();
  chart.data.labels.push(t);
  chart.data.datasets[0].data.push(s.db_fs);
  if (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
  els.levelValue.textContent = s.db_fs.toFixed(1);
}

// --- Config ----------------------------------------------------------------

async function loadConfig() {
  const r = await fetch('/api/config');
  if (!r.ok) return;
  const c = await r.json();
  els.ipInput.value = c.ip || '';
  els.portInput.value = c.port || 80;
}

els.saveBtn.addEventListener('click', async () => {
  els.configMsg.textContent = 'Saving…';
  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: els.ipInput.value.trim(),
        port: parseInt(els.portInput.value, 10),
      }),
    });
    const body = await r.json();
    els.configMsg.textContent = r.ok ? 'Saved.' : (body.error || 'Error');
    if (r.ok) pollBoard();
  } catch (e) {
    els.configMsg.textContent = String(e);
  }
});

// --- Board polling ---------------------------------------------------------

async function pollBoard() {
  try {
    const r = await fetch('/api/proxy/info');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const info = await r.json();
    els.boardStatus.className = 'badge bg-success';
    els.boardStatus.textContent = info.stale ? 'stale' : 'online';
    els.infoChip.textContent = info.chip_model || '—';
    els.infoFw.textContent = info.firmware_version || '—';
    els.infoIp.textContent = info.wifi_ip || '—';
    els.infoRssi.textContent = info.wifi_rssi ?? '—';
    els.infoStreaming.textContent = info.streaming ? 'yes' : 'no';
    els.infoSr.textContent = info.stream?.sample_rate ?? info.audio_sample_rate ?? '—';
  } catch {
    els.boardStatus.className = 'badge bg-danger';
    els.boardStatus.textContent = 'offline';
  }
}

// --- Ingest status & controls ---------------------------------------------

async function pollIngest() {
  try {
    const r = await fetch('/api/stream/status');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const s = await r.json();
    if (!s.enabled) {
      els.ingestStatus.className = 'badge bg-secondary';
      els.ingestStatus.textContent = 'disabled';
    } else if (s.connected) {
      els.ingestStatus.className = 'badge bg-success';
      els.ingestStatus.textContent = 'streaming';
    } else if (s.listening) {
      els.ingestStatus.className = 'badge bg-warning text-dark';
      els.ingestStatus.textContent = 'waiting';
    } else {
      els.ingestStatus.className = 'badge bg-secondary';
      els.ingestStatus.textContent = 'stopped';
    }
    els.ingestPort.textContent = s.port ?? '—';
    els.ingestClient.textContent = s.client || 'none';
    els.ingestBytes.textContent = (s.bytes_received ?? 0).toLocaleString();
  } catch {
    els.ingestStatus.className = 'badge bg-danger';
    els.ingestStatus.textContent = 'error';
  }
}

async function setListener(enabled) {
  els.streamMsg.textContent = '';
  try {
    const r = await fetch('/api/stream/listener', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      els.streamMsg.textContent = body.error || ('HTTP ' + r.status);
    }
    pollIngest();
  } catch (e) {
    els.streamMsg.textContent = String(e);
  }
}

els.startBtn.addEventListener('click', () => setListener(true));
els.stopBtn.addEventListener('click', () => setListener(false));

// --- SSE live samples ------------------------------------------------------

function connectLiveSamples() {
  const es = new EventSource('/api/stream/live-samples');
  es.addEventListener('samples', (evt) => {
    try {
      const arr = JSON.parse(evt.data);
      if (Array.isArray(arr)) arr.forEach(pushSample);
    } catch {}
  });
  es.onerror = () => {
    // EventSource auto-reconnects.
  };
}

// --- Boot ------------------------------------------------------------------

loadConfig().then(pollBoard);
pollIngest();
connectLiveSamples();
setInterval(pollBoard, 5000);
setInterval(pollIngest, 2000);

// --- Recordings ------------------------------------------------------------

const recsList    = document.getElementById('recordings-list');
const audioPlayer = document.getElementById('audio-player');

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60)   return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

async function loadRecordings() {
  try {
    const r = await fetch('/api/stream/recordings');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const recs = await r.json();
    recsList.innerHTML = '';
    if (!recs.length) {
      recsList.innerHTML = '<div class="text-secondary small p-2">No recordings yet.</div>';
      return;
    }
    // newest first
    recs.slice().reverse().forEach((rec) => {
      const dt     = new Date(rec.start_ms).toLocaleString();
      const dur    = fmtDuration(rec.duration_ms);
      const btn    = document.createElement('button');
      btn.className =
        'list-group-item list-group-item-action d-flex justify-content-between ' +
        'align-items-center py-1 px-2 bg-transparent border-secondary text-light small';
      btn.innerHTML =
        `<span>${dt}</span>` +
        `<span class="d-flex gap-2 align-items-center">` +
        (rec.is_live ? '<span class="badge bg-success">live</span>' : '') +
        `<span class="text-secondary">${dur}</span>` +
        `<span class="badge bg-secondary">WAV</span>` +
        `</span>`;
      btn.addEventListener('click', () => {
        recsList.querySelectorAll('.list-group-item').forEach((el) =>
          el.classList.remove('active'),
        );
        btn.classList.add('active');
        audioPlayer.src = '/api/stream/file/' + rec.relative_path;
        audioPlayer.style.display = '';
        audioPlayer.play().catch(() => {});
      });
      recsList.appendChild(btn);
    });
  } catch (e) {
    recsList.innerHTML = `<div class="text-danger small p-2">${e}</div>`;
  }
}

document.getElementById('refresh-recs-btn').addEventListener('click', loadRecordings);
loadRecordings();
// auto-refresh list every 30 s so the live entry's duration stays roughly current
setInterval(loadRecordings, 30000);
