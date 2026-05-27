'use strict';

const MAX_POINTS = 600;

// ─── Network connectivity guard ─────────────────────────────────────────────

let isNetworkConnected = null; // null = unknown, allows first check to always execute
let networkCheckInterval = null;
const networkOverlay = document.getElementById('network-overlay');
const mainTabs = document.getElementById('main-tabs');
const currentNetworkText = document.getElementById('current-network-text');
const allowedNetworksText = document.getElementById('allowed-networks-text');
const quitToNetworkCheckBtn = document.getElementById('quit-to-network-check-btn');

async function checkNetworkConnectivity() {
  console.log('[Network Check] Starting network validation...');
  try {
    const r = await fetch('/api/network/check', {
      method: 'GET',
      cache: 'no-cache',
      signal: AbortSignal.timeout(3000),
    });
    
    if (r.ok) {
      const data = await r.json();
      console.log('[Network Check] Response:', data);
      
      // Update allowed networks display
      if (data.allowedNetworks && data.allowedNetworks.length > 0) {
        allowedNetworksText.textContent = data.allowedNetworks.join(' or ');
      }
      
      // Update current network display
      if (data.connected && data.networkName) {
        currentNetworkText.textContent = `Current network: ${data.networkName}`;
      } else {
        currentNetworkText.textContent = 'No WiFi connection detected';
      }
      
      // Only allow access if on approved network
      if (data.isAllowed) {
        console.log('[Network Check] ✓ Network allowed - enabling interface');
        setNetworkConnected(true);
        return true;
      } else {
        console.log('[Network Check] ✗ Network NOT allowed - showing overlay');
        setNetworkConnected(false);
        return false;
      }
    }
    
    console.log('[Network Check] Request failed');
    setNetworkConnected(false);
    return false;
  } catch (err) {
    console.error('[Network Check] Error:', err);
    currentNetworkText.textContent = 'Unable to check network status';
    setNetworkConnected(false);
    return false;
  }
}

function setNetworkConnected(connected) {
  console.log(`[Network Check] setNetworkConnected(${connected}) - current state: ${isNetworkConnected}`);
  if (isNetworkConnected === connected) {
    console.log('[Network Check] State unchanged, skipping');
    return;
  }
  isNetworkConnected = connected;

  if (connected) {
    console.log('[Network Check] Hiding overlay, enabling interactions');
    networkOverlay.classList.add('d-none');
    enableAllInteractions();
  } else {
    console.log('[Network Check] Showing overlay, disabling interactions');
    networkOverlay.classList.remove('d-none');
    disableAllInteractions();
  }
}

function disableAllInteractions() {
  // Disable all tab navigation
  const tabButtons = mainTabs.querySelectorAll('button[data-bs-toggle="tab"]');
  tabButtons.forEach(btn => {
    btn.disabled = true;
    btn.style.pointerEvents = 'none';
  });

  // Disable all inputs and buttons in the dashboard
  document.querySelectorAll('input, button, select, textarea, a').forEach(el => {
    if (!el.closest('#network-overlay')) {
      el.disabled = true;
      el.style.pointerEvents = 'none';
    }
  });
}

function enableAllInteractions() {
  // Enable tab navigation
  const tabButtons = mainTabs.querySelectorAll('button[data-bs-toggle="tab"]');
  tabButtons.forEach(btn => {
    btn.disabled = false;
    btn.style.pointerEvents = '';
  });

  // Enable all inputs and buttons
  document.querySelectorAll('input, button, select, textarea, a').forEach(el => {
    if (!el.closest('#network-overlay')) {
      el.disabled = false;
      el.style.pointerEvents = '';
    }
  });
}

function guardedFetch(url, options) {
  if (!isNetworkConnected) {
    return Promise.reject(new Error('Network not connected'));
  }
  return fetch(url, options);
}

const els = {
  boardStatus:   document.getElementById('board-status'),
  ingestStatus:  document.getElementById('ingest-status'),
  ingest2Status: document.getElementById('ingest2-status'),
  ipInput:       document.getElementById('esp32-ip-input'),
  portInput:     document.getElementById('esp32-port-input'),
  saveBtn:       document.getElementById('save-config-btn'),
  configMsg:     document.getElementById('config-msg'),
  infoChip:      document.getElementById('info-chip'),
  infoFw:        document.getElementById('info-fw'),
  infoIp:        document.getElementById('info-ip'),
  infoRssi:      document.getElementById('info-rssi'),
  infoStreaming: document.getElementById('info-streaming'),
  infoSr:        document.getElementById('info-sr'),
  levelValue:    document.getElementById('level-value'),
  startBtn:      document.getElementById('start-btn'),
  stopBtn:       document.getElementById('stop-btn'),
  ingestPort:    document.getElementById('ingest-port'),
  ingestClient:  document.getElementById('ingest-client'),
  ingestBytes:   document.getElementById('ingest-bytes'),
  streamMsg:     document.getElementById('stream-msg'),
  u2Status:      document.getElementById('u2-status'),
  u2Port:        document.getElementById('u2-port'),
  u2Client:      document.getElementById('u2-client'),
  u2Bytes:       document.getElementById('u2-bytes'),
  u2Sr:          document.getElementById('u2-sr'),
  u2StartBtn:    document.getElementById('u2-start-btn'),
  u2StopBtn:     document.getElementById('u2-stop-btn'),
  u2Msg:         document.getElementById('u2-msg'),
  u2LevelValue:  document.getElementById('u2-level-value'),
};

// ─── Charts ─────────────────────────────────────────────────────────────────

function makeChart(canvasId, color) {
  return new Chart(document.getElementById(canvasId).getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'dBFS',
        data: [],
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ',0.12)'),
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
}

const chart  = makeChart('wave-chart',  'rgb(74,222,128)');
const chart2 = makeChart('wave-chart2', 'rgb(96,165,250)');

function pushSample1(s) {
  chart.data.labels.push(new Date(s.t_ms).toLocaleTimeString());
  chart.data.datasets[0].data.push(s.db_fs);
  if (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
  els.levelValue.textContent = s.db_fs.toFixed(1);
}

function pushSample2(s) {
  chart2.data.labels.push(new Date(s.t_ms).toLocaleTimeString());
  chart2.data.datasets[0].data.push(s.db_fs);
  if (chart2.data.labels.length > MAX_POINTS) {
    chart2.data.labels.shift();
    chart2.data.datasets[0].data.shift();
  }
  chart2.update('none');
  els.u2LevelValue.textContent = s.db_fs.toFixed(1);
}

// ─── Dashboard config ───────────────────────────────────────────────────────

async function loadConfig() {
  const r = await guardedFetch('/api/config');
  if (!r.ok) return;
  const c = await r.json();
  els.ipInput.value   = c.ip   || '';
  els.portInput.value = c.port || 80;
}

els.saveBtn.addEventListener('click', async () => {
  els.configMsg.textContent = 'Saving…';
  try {
    const r = await guardedFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip:   els.ipInput.value.trim(),
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

async function pollBoard() {
  try {
    // Silently skip when no IP is configured — avoids noisy 503s in console.
    if (!els.ipInput.value.trim()) {
      els.boardStatus.className   = 'badge bg-secondary';
      els.boardStatus.textContent = 'not configured';
      return;
    }
    const r = await guardedFetch('/api/proxy/info');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const info = await r.json();
    els.boardStatus.className   = 'badge bg-success';
    els.boardStatus.textContent = info.stale ? 'stale' : 'online';
    els.infoChip.textContent      = info.chip_model        || '—';
    els.infoFw.textContent        = info.firmware_version  || '—';
    els.infoIp.textContent        = info.ip                || info.wifi_ip || '—';
    els.infoRssi.textContent      = info.rssi_dbm          ?? info.wifi_rssi ?? '—';
    els.infoStreaming.textContent = info.streaming ? 'yes' : 'no';
    els.infoSr.textContent        = info.stream?.sample_rate ?? info.audio_sample_rate ?? '—';
  } catch {
    els.boardStatus.className   = 'badge bg-danger';
    els.boardStatus.textContent = 'offline';
  }
}

function applyIngestBadge(el, s) {
  if (!s.enabled)        { el.className = 'badge bg-secondary';            el.textContent = 'disabled'; }
  else if (s.connected)  { el.className = 'badge bg-success';              el.textContent = 'streaming'; }
  else if (s.listening)  { el.className = 'badge bg-warning text-dark';    el.textContent = 'waiting'; }
  else                   { el.className = 'badge bg-secondary';            el.textContent = 'stopped'; }
}

async function pollIngest() {
  try {
    const r = await guardedFetch('/api/stream/status');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const s = await r.json();
    applyIngestBadge(els.ingestStatus, s);
    els.ingestPort.textContent   = s.port              ?? '—';
    els.ingestClient.textContent = s.client            || 'none';
    els.ingestBytes.textContent  = (s.bytes_received ?? 0).toLocaleString();
  } catch {
    els.ingestStatus.className   = 'badge bg-danger';
    els.ingestStatus.textContent = 'error';
  }
}

async function setListener(enabled) {
  els.streamMsg.textContent = '';
  try {
    const r = await guardedFetch('/api/stream/listener', {
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
els.stopBtn .addEventListener('click', () => setListener(false));

async function pollIngest2() {
  try {
    const r = await guardedFetch('/api/stream2/status');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const s = await r.json();
    applyIngestBadge(els.ingest2Status, s);
    applyIngestBadge(els.u2Status, s);
    els.u2Port  .textContent = s.port              ?? '—';
    els.u2Client.textContent = s.client            || 'none';
    els.u2Bytes .textContent = (s.bytes_received ?? 0).toLocaleString();
    els.u2Sr    .textContent = s.sample_rate       ?? '—';
  } catch {
    els.ingest2Status.className   = 'badge bg-danger';
    els.ingest2Status.textContent = 'error';
  }
}

async function setListener2(enabled) {
  els.u2Msg.textContent = '';
  try {
    const r = await guardedFetch('/api/stream2/listener', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      els.u2Msg.textContent = body.error || ('HTTP ' + r.status);
    }
    pollIngest2();
  } catch (e) {
    els.u2Msg.textContent = String(e);
  }
}

els.u2StartBtn.addEventListener('click', () => setListener2(true));
els.u2StopBtn .addEventListener('click', () => setListener2(false));

function connectLiveSamples() {
  const es = new EventSource('/api/stream/live-samples');
  es.addEventListener('samples', (evt) => {
    try {
      const arr = JSON.parse(evt.data);
      if (Array.isArray(arr)) arr.forEach(pushSample1);
    } catch {}
  });
}

function connectLiveSamples2() {
  const es = new EventSource('/api/stream2/live-samples');
  es.addEventListener('samples', (evt) => {
    try {
      const arr = JSON.parse(evt.data);
      if (Array.isArray(arr)) arr.forEach(pushSample2);
    } catch {}
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULES TAB
// ═══════════════════════════════════════════════════════════════════════════

const modEls = {
  grid:           document.getElementById('modules-grid'),
  count:          document.getElementById('modules-count'),
  modal:          null,                              // bootstrap.Modal instance
  modalName:      document.getElementById('modal-mod-name'),
  modalType:      document.getElementById('modal-mod-type'),
  modalStatus:    document.getElementById('modal-mod-status'),
  modalImgZone:   document.getElementById('modal-img-zone'),
  modalImgFile:   document.getElementById('modal-img-file'),
  modalImgMsg:    document.getElementById('modal-img-msg'),
  modalUploadBtn: document.getElementById('modal-upload-btn'),
  modalRemoveBtn: document.getElementById('modal-remove-img-btn'),
  modalIpInput:   document.getElementById('modal-ip-input'),
  modalPortInput: document.getElementById('modal-port-input'),
  modalSaveIpBtn: document.getElementById('modal-save-ip-btn'),
  modalIpMsg:     document.getElementById('modal-ip-msg'),
  modalLedSection: document.getElementById('modal-led-section'),
  modalLedOn:     document.getElementById('modal-led-on'),
  modalLedOff:    document.getElementById('modal-led-off'),
  modalLedBlink:  document.getElementById('modal-led-blink'),
  modalLedMsg:    document.getElementById('modal-led-msg'),
  modalOpenWrap:  document.getElementById('modal-open-device-wrap'),
  modalOpenLink:  document.getElementById('modal-open-device'),
};

let modules = [];
let currentModule = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function moduleThumbnail(m) {
  if (m.imageFile) {
    return `<img class="module-thumb-img"
                 src="/uploads/${encodeURIComponent(m.imageFile)}?t=${Date.now()}"
                 alt="${escapeHtml(m.name)}" />`;
  }
  // Generic chip-like SVG placeholder
  return `
    <svg class="module-thumb-img module-thumb-placeholder" viewBox="0 0 100 100"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="22" y="22" width="56" height="56" rx="4" fill="#2a3036" stroke="#4ade80" stroke-width="1.5"/>
      <rect x="34" y="34" width="32" height="32" rx="2" fill="#1b1f24"/>
      <g stroke="#4ade80" stroke-width="1.2">
        <line x1="14" y1="34" x2="22" y2="34"/><line x1="14" y1="42" x2="22" y2="42"/>
        <line x1="14" y1="50" x2="22" y2="50"/><line x1="14" y1="58" x2="22" y2="58"/>
        <line x1="14" y1="66" x2="22" y2="66"/>
        <line x1="78" y1="34" x2="86" y2="34"/><line x1="78" y1="42" x2="86" y2="42"/>
        <line x1="78" y1="50" x2="86" y2="50"/><line x1="78" y1="58" x2="86" y2="58"/>
        <line x1="78" y1="66" x2="86" y2="66"/>
        <line x1="34" y1="14" x2="34" y2="22"/><line x1="42" y1="14" x2="42" y2="22"/>
        <line x1="50" y1="14" x2="50" y2="22"/><line x1="58" y1="14" x2="58" y2="22"/>
        <line x1="66" y1="14" x2="66" y2="22"/>
        <line x1="34" y1="78" x2="34" y2="86"/><line x1="42" y1="78" x2="42" y2="86"/>
        <line x1="50" y1="78" x2="50" y2="86"/><line x1="58" y1="78" x2="58" y2="86"/>
        <line x1="66" y1="78" x2="66" y2="86"/>
      </g>
    </svg>
  `;
}

function renderModules() {
  modEls.count.textContent = modules.length
    ? `(${modules.length} registered)` : '';
  if (!modules.length) {
    modEls.grid.innerHTML =
      '<div class="col-12 text-center text-secondary py-5">No modules registered.</div>';
    return;
  }
  modEls.grid.innerHTML = modules.map(m => {
    const tags = [];
    if (m.hasLed) tags.push('<span class="badge bg-warning text-dark">LED</span>');
    if (m.ip)     tags.push(`<span class="badge bg-info text-dark">${escapeHtml(m.ip)}</span>`);
    else          tags.push('<span class="badge bg-secondary">no IP</span>');
    return `
      <div class="col-12 col-sm-6 col-md-4 col-xl-3">
        <button type="button" class="module-card w-100 text-start"
                data-module-id="${escapeHtml(m.id)}">
          <div class="module-thumb">${moduleThumbnail(m)}</div>
          <div class="module-info">
            <div class="module-name text-truncate">${escapeHtml(m.name)}</div>
            <div class="module-type text-secondary small text-truncate">${escapeHtml(m.type)}</div>
            <div class="module-tags mt-2 d-flex flex-wrap gap-1">${tags.join('')}</div>
          </div>
        </button>
      </div>
    `;
  }).join('');

  modEls.grid.querySelectorAll('[data-module-id]').forEach(btn => {
    btn.addEventListener('click', () => openModuleModal(btn.dataset.moduleId));
  });
}

async function loadModules() {
  try {
    const r = await guardedFetch('/api/modules');
    modules = await r.json();
    renderModules();
  } catch (e) {
    modEls.grid.innerHTML =
      `<div class="col-12 text-center text-danger py-5">Failed to load modules: ${escapeHtml(e.message)}</div>`;
  }
}

function renderModalImage(m) {
  if (m.imageFile) {
    modEls.modalImgZone.classList.add('has-image');
    modEls.modalImgZone.innerHTML = `
      <img src="/uploads/${encodeURIComponent(m.imageFile)}?t=${Date.now()}"
           alt="${escapeHtml(m.name)}" />`;
    modEls.modalRemoveBtn.classList.remove('d-none');
  } else {
    modEls.modalImgZone.classList.remove('has-image');
    modEls.modalImgZone.innerHTML = `
      <div class="module-img-empty">
        <div class="module-img-empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42"
               fill="currentColor" viewBox="0 0 16 16">
            <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>
            <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1z"/>
          </svg>
        </div>
        <div class="module-img-empty-text">
          No photo yet<br>
          <span class="small text-secondary">Click here or use the button below to upload</span>
        </div>
      </div>`;
    modEls.modalRemoveBtn.classList.add('d-none');
  }
}

function openModuleModal(id) {
  const m = modules.find(x => x.id === id);
  if (!m) return;
  currentModule = m;

  modEls.modalName.textContent = m.name;
  modEls.modalType.textContent = m.type;
  modEls.modalStatus.className = 'badge ' + (m.ip ? 'bg-info text-dark' : 'bg-secondary');
  modEls.modalStatus.textContent = m.ip ? `${m.ip}:${m.port}` : 'not configured';

  modEls.modalIpInput.value   = m.ip   || '';
  modEls.modalPortInput.value = m.port || 80;
  modEls.modalIpMsg.textContent = '';
  modEls.modalImgMsg.textContent = '';
  modEls.modalLedMsg.textContent = '';

  renderModalImage(m);

  if (m.hasLed) {
    modEls.modalLedSection.classList.remove('d-none');
  } else {
    modEls.modalLedSection.classList.add('d-none');
  }

  if (m.ip) {
    modEls.modalOpenWrap.classList.remove('d-none');
    modEls.modalOpenLink.href = `http://${m.ip}:${m.port}/`;
  } else {
    modEls.modalOpenWrap.classList.add('d-none');
  }

  if (!modEls.modal) {
    modEls.modal = new bootstrap.Modal(document.getElementById('moduleModal'));
  }
  modEls.modal.show();
}

// ── Upload handling ─────────────────────────────────────────────────────────

function triggerFilePicker() { modEls.modalImgFile.click(); }

modEls.modalImgZone.addEventListener('click', triggerFilePicker);
modEls.modalUploadBtn.addEventListener('click', triggerFilePicker);

['dragenter', 'dragover'].forEach(ev => {
  modEls.modalImgZone.addEventListener(ev, e => {
    e.preventDefault();
    modEls.modalImgZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach(ev => {
  modEls.modalImgZone.addEventListener(ev, e => {
    e.preventDefault();
    modEls.modalImgZone.classList.remove('drag-over');
  });
});
modEls.modalImgZone.addEventListener('drop', e => {
  const f = e.dataTransfer?.files?.[0];
  if (f) uploadImage(f);
});

modEls.modalImgFile.addEventListener('change', e => {
  const f = e.target.files?.[0];
  if (f) uploadImage(f);
  e.target.value = '';
});

async function uploadImage(file) {
  if (!currentModule) return;
  if (!file.type.startsWith('image/')) {
    modEls.modalImgMsg.innerHTML = '<span class="text-danger">Please choose an image file.</span>';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    modEls.modalImgMsg.innerHTML = '<span class="text-danger">Image must be under 5 MB.</span>';
    return;
  }
  modEls.modalImgMsg.innerHTML = '<span class="text-info">Uploading…</span>';

  const fd = new FormData();
  fd.append('image', file);

  try {
    const r = await guardedFetch(`/api/modules/${encodeURIComponent(currentModule.id)}/image`, {
      method: 'POST',
      body: fd,
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    modEls.modalImgMsg.innerHTML = '<span class="text-success">Saved.</span>';
    currentModule.imageFile = body.imageFile;
    renderModalImage(currentModule);
    await loadModules();
  } catch (e) {
    modEls.modalImgMsg.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
  }
}

modEls.modalRemoveBtn.addEventListener('click', async () => {
  if (!currentModule) return;
  if (!confirm('Remove this module photo?')) return;
  modEls.modalImgMsg.innerHTML = '<span class="text-info">Removing…</span>';
  try {
    const r = await guardedFetch(`/api/modules/${encodeURIComponent(currentModule.id)}/image`, {
      method: 'DELETE',
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    modEls.modalImgMsg.innerHTML = '<span class="text-success">Removed.</span>';
    delete currentModule.imageFile;
    renderModalImage(currentModule);
    await loadModules();
  } catch (e) {
    modEls.modalImgMsg.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
  }
});

// ── IP / port save ──────────────────────────────────────────────────────────

modEls.modalSaveIpBtn.addEventListener('click', async () => {
  if (!currentModule) return;
  const ip   = modEls.modalIpInput.value.trim();
  const port = parseInt(modEls.modalPortInput.value, 10);
  modEls.modalIpMsg.innerHTML = '<span class="text-info">Saving…</span>';
  try {
    const r = await guardedFetch(`/api/modules/${encodeURIComponent(currentModule.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    modEls.modalIpMsg.innerHTML = '<span class="text-success">Saved.</span>';
    Object.assign(currentModule, { ip: body.ip, port: body.port });
    modEls.modalStatus.className = 'badge bg-info text-dark';
    modEls.modalStatus.textContent = `${body.ip}:${body.port}`;
    modEls.modalOpenWrap.classList.remove('d-none');
    modEls.modalOpenLink.href = `http://${body.ip}:${body.port}/`;
    await loadModules();
  } catch (e) {
    modEls.modalIpMsg.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
  }
});

// ── LED control ─────────────────────────────────────────────────────────────

async function sendLed(cmd) {
  if (!currentModule) return;
  modEls.modalLedMsg.innerHTML =
    `<span class="text-info">Sending <code>${cmd}</code>…</span>`;
  try {
    const r = await guardedFetch(
      `/api/modules/${encodeURIComponent(currentModule.id)}/led/${cmd}`,
      { method: 'POST' },
    );
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    modEls.modalLedMsg.innerHTML =
      `<span class="text-success">LED command <code>${cmd}</code> sent.</span>`;
  } catch (e) {
    modEls.modalLedMsg.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
  }
}

modEls.modalLedOn   .addEventListener('click', () => sendLed('on'));
modEls.modalLedOff  .addEventListener('click', () => sendLed('off'));
modEls.modalLedBlink.addEventListener('click', () => sendLed('blink'));

// Open device page in new tab (handle click explicitly to avoid extension interference)
modEls.modalOpenLink.addEventListener('click', (e) => {
  e.preventDefault();
  const url = modEls.modalOpenLink.href;
  if (url && url !== '#') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
});

// Refresh modules whenever the Modules tab is shown
document.getElementById('modules-tab').addEventListener('shown.bs.tab', loadModules);

// ─── Network overlay quit button ────────────────────────────────────────────

quitToNetworkCheckBtn.addEventListener('click', () => {
  window.location.href = '/network-check.html';
});

// ─── Boot ───────────────────────────────────────────────────────────────────

async function initializeApp() {
  // Check network connectivity first
  const connected = await checkNetworkConnectivity();
  
  if (connected) {
    // Only start normal operations if connected
    loadConfig().then(pollBoard);
    pollIngest();
    pollIngest2();
    connectLiveSamples();
    connectLiveSamples2();
    loadModules();
    setInterval(pollBoard,   5000);
    setInterval(pollIngest,  2000);
    setInterval(pollIngest2, 2000);
  }
  
  // Check connectivity every 3 seconds
  networkCheckInterval = setInterval(async () => {
    const wasConnected = isNetworkConnected;
    await checkNetworkConnectivity();
    
    // If we just connected (was not connected before, now is)
    if (wasConnected === false && isNetworkConnected === true) {
      console.log('[Network Check] Network became valid! Reloading page...');
      location.reload();
    }
    // If we just disconnected (was connected before, now is not)
    if (wasConnected === true && isNetworkConnected === false) {
      console.log('[Network Check] Network became invalid! Showing overlay...');
    }
  }, 3000);
}

initializeApp();
