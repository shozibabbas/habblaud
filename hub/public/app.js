/* Habblaud Hub: several Habblaud offices as iframe tiles, Google Meet style.
 *
 * Layout rule: tiles never move in the DOM. Re-parenting an iframe reloads it, so every layout (grid, spotlight,
 * filmstrip) is computed here and applied as absolute positions on the same, stable elements.
 *
 * Embed protocol (see hub/README.md):
 *   hub → frame  {type:'habblaud:embed', compact}   on ready and after every layout change
 *   hub → frame  {type:'habblaud:overview'}          after the tile changed size (debounced)
 *   frame → hub  {type:'habblaud:ready'}
 *   frame → hub  {type:'habblaud:summary', rooms, agents, working, subagents, needsYou, shells, connection}
 * Messages are accepted only from the tile's own contentWindow AND from the office URL's origin.
 */
'use strict';

const PREFS_KEY = 'habblaud-hub:prefs';
const GAP = 10;
const LABEL_H = 32;
const FRAME_RATIO = 16 / 10;
const STALE_MS = 15_000; // no summary for this long → amber "reconnecting"
const FIRST_CONTACT_MS = 15_000; // no message at all after load → probe the office
const OFFLINE_AFTER_MS = 45_000; // silent this long and the probe fails → offline card
const QUIET_MS = 20_000; // auto-spotlight waits this long after the last user interaction
const PROBE_TIMEOUT_MS = 5_000;
const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 30_000;
const OVERVIEW_DEBOUNCE_MS = 350;
const HEALTHY = new Set(['open', 'mock', 'online', 'connected', 'live', 'ok', true]);

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- preferences (localStorage may be unavailable) ---------- */

const prefs = loadPrefs();

function loadPrefs() {
  const base = { layout: 'grid', spotlightId: null, autoSpotlight: true, notify: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {
    /* private mode, blocked storage, bad JSON: defaults */
  }
  return base;
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* not persisted, still works for this page */
  }
}

/* ---------- state ---------- */

const state = {
  title: 'Habblaud Hub',
  tiles: [],
  /** @type {'grid'|'spotlight'} */
  layout: 'grid',
  spotlightId: null,
  lastInteraction: 0,
};

const stage = $('#stage');

/* ---------- config ---------- */

async function loadConfig() {
  let res;
  try {
    res = await fetch('/config.json', { cache: 'no-store' });
  } catch {
    throw new Error('Could not fetch config.json.');
  }
  if (!res.ok) throw new Error(`config.json answered ${res.status}. Create it from config.example.json and mount it.`);
  let cfg;
  try {
    cfg = await res.json();
  } catch {
    throw new Error('config.json is not valid JSON.');
  }
  const offices = [];
  const seen = new Set();
  for (const [i, o] of (Array.isArray(cfg.offices) ? cfg.offices : []).entries()) {
    let url;
    try {
      url = new URL(String(o?.url ?? ''));
    } catch {
      console.warn(`[hub] office #${i + 1}: invalid url, skipped`, o);
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      console.warn(`[hub] office #${i + 1}: only http(s) urls, skipped`, o);
      continue;
    }
    let id = String(o.id ?? '').trim() || `office-${i + 1}`;
    while (seen.has(id)) id += '-2';
    seen.add(id);
    offices.push({ id, name: String(o.name ?? '').trim() || url.host, url });
  }
  return { title: String(cfg.title ?? '').trim() || 'Habblaud Hub', offices };
}

/* ---------- tiles ---------- */

function createTile(office, index) {
  const el = $('#tile-tpl').content.firstElementChild.cloneNode(true);
  const src = new URL(office.url.href);
  src.searchParams.set('embed', '1');

  const tile = {
    id: office.id,
    office,
    origin: office.url.origin,
    src: src.href,
    index,
    el,
    frame: $('.tile__frame', el),
    label: $('.tile__label', el),
    status: 'loading', // loading | live | stale | silent | offline
    summary: null,
    lastMsgAt: 0,
    loadStartedAt: 0,
    retryDelay: RETRY_MIN_MS,
    nextProbeAt: 0,
    probing: false,
    rect: null,
    overviewTimer: 0,
    clickTimer: 0,
    pulseTimer: 0,
  };

  el.dataset.id = office.id;
  $('.tile__key', el).textContent = index < 9 ? String(index + 1) : '';
  $('.tile__name', el).textContent = office.name;
  $('.tile__name', el).title = office.url.host;
  $('.tile__open', el).href = office.url.href;
  tile.frame.title = `${office.name} office`;
  $('.card--offline .card__text', el).textContent = `${office.name} isn't answering at ${office.url.host}.`;

  tile.label.addEventListener('click', (e) => {
    if (e.target.closest('.tile__btn')) return;
    // Wait a beat so a double-click doesn't spotlight, unspotlight, then go full screen.
    clearTimeout(tile.clickTimer);
    if (e.detail > 1) return;
    tile.clickTimer = setTimeout(() => onLabelClick(tile), 220);
  });
  tile.label.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tile__btn')) return;
    clearTimeout(tile.clickTimer);
    spotlight(tile.id);
    goFullscreen(tile);
  });
  tile.label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onLabelClick(tile);
    }
  });
  $('.tile__full', el).addEventListener('click', () => {
    spotlight(tile.id);
    goFullscreen(tile);
  });
  $('.card__retry', el).addEventListener('click', () => {
    tile.retryDelay = RETRY_MIN_MS;
    reloadFrame(tile);
  });

  stage.append(el);
  setStatus(tile, 'loading');
  reloadFrame(tile);
  return tile;
}

function reloadFrame(tile) {
  tile.lastMsgAt = 0;
  tile.loadStartedAt = Date.now();
  tile.nextProbeAt = 0;
  setStatus(tile, 'loading');
  // Assigning src reloads only this iframe; the element stays where it is.
  tile.frame.src = tile.src;
}

function onLabelClick(tile) {
  touch();
  if (state.layout === 'spotlight' && state.spotlightId === tile.id) showGrid();
  else spotlight(tile.id);
}

function goFullscreen(tile) {
  const el = tile.el;
  if (document.fullscreenElement === el) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) Promise.resolve(req.call(el)).catch(() => {});
}

/* ---------- status ---------- */

const STATE_TEXT = {
  loading: 'connecting…',
  live: '',
  stale: 'reconnecting',
  silent: 'no status',
  offline: 'offline',
};

function setStatus(tile, status) {
  if (tile.status === status && tile.el.dataset.status === status) return;
  tile.status = status;
  tile.el.dataset.status = status;
  const stateEl = $('.tile__state', tile.el);
  stateEl.textContent = STATE_TEXT[status] ?? '';
  const dot = $('.dot', tile.el);
  dot.title =
    status === 'live'
      ? 'Live'
      : status === 'silent'
        ? 'The page loaded but sends no status (an older Habblaud without embed mode?)'
        : STATE_TEXT[status];
  renderTotals();
}

function connectionHealthy(c) {
  return c === undefined || c === null || HEALTHY.has(typeof c === 'string' ? c.toLowerCase() : c);
}

/* ---------- messages ---------- */

function post(tile, msg) {
  // Until the office has spoken, the frame may still be about:blank or an error page: nothing to tell it.
  if (!tile.lastMsgAt) return;
  try {
    tile.frame.contentWindow?.postMessage(msg, tile.origin);
  } catch {
    /* frame gone or navigating */
  }
}

function isCompact(tile) {
  if (state.tiles.length === 1) return false;
  if (document.fullscreenElement === tile.el) return false;
  return !(state.layout === 'spotlight' && state.spotlightId === tile.id);
}

function sendEmbed(tile) {
  post(tile, { type: 'habblaud:embed', compact: isCompact(tile) });
}

function scheduleOverview(tile) {
  clearTimeout(tile.overviewTimer);
  tile.overviewTimer = setTimeout(() => post(tile, { type: 'habblaud:overview' }), OVERVIEW_DEBOUNCE_MS);
}

const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

window.addEventListener('message', (e) => {
  const data = e.data;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
  const tile = state.tiles.find((t) => t.frame.contentWindow === e.source);
  if (!tile || e.origin !== tile.origin) return;

  if (data.type === 'habblaud:ready') {
    tile.lastMsgAt = Date.now();
    tile.retryDelay = RETRY_MIN_MS;
    if (tile.status !== 'live') setStatus(tile, 'live');
    sendEmbed(tile);
    scheduleOverview(tile);
    return;
  }

  if (data.type === 'habblaud:summary') {
    tile.lastMsgAt = Date.now();
    tile.retryDelay = RETRY_MIN_MS;
    const prev = tile.summary;
    const s = {
      rooms: num(data.rooms),
      agents: num(data.agents),
      working: num(data.working),
      subagents: num(data.subagents),
      needsYou: num(data.needsYou),
      shells: num(data.shells),
      connection: data.connection,
    };
    tile.summary = s;
    setStatus(tile, connectionHealthy(s.connection) ? 'live' : 'stale');
    renderTileCounts(tile);
    renderTotals();
    // The first summary after a (re)load is a baseline, not news.
    if (prev && prev.needsYou === 0 && s.needsYou > 0) onNeedsYou(tile);
    if (s.needsYou === 0) tile.el.classList.remove('tile--attention');
  }
});

/* ---------- needs-you ---------- */

function onNeedsYou(tile) {
  tile.el.classList.add('tile--attention');
  tile.el.classList.remove('tile--pulse');
  void tile.el.offsetWidth; // restart the animation
  tile.el.classList.add('tile--pulse');
  clearTimeout(tile.pulseTimer);
  tile.pulseTimer = setTimeout(() => tile.el.classList.remove('tile--pulse'), 6000);

  if (prefs.autoSpotlight && !userIsBusy() && !(state.layout === 'spotlight' && state.spotlightId === tile.id)) {
    spotlight(tile.id, { auto: true });
  }
  notify(tile);
}

function userIsBusy() {
  if (Date.now() - state.lastInteraction < QUIET_MS) return true;
  // Typing inside an office (focus in its iframe) while the hub has focus counts as busy.
  return document.hasFocus() && document.activeElement?.tagName === 'IFRAME';
}

function touch() {
  state.lastInteraction = Date.now();
}

for (const type of ['pointerdown', 'keydown', 'wheel']) {
  window.addEventListener(type, touch, { passive: true, capture: true });
}
// Clicking into an iframe blurs the hub window: that's an interaction too.
window.addEventListener('blur', () => {
  setTimeout(() => {
    if (document.activeElement?.tagName === 'IFRAME') touch();
  }, 0);
});

/* ---------- notifications ---------- */

const notifyBtn = $('#btn-notify');
const notifyLabel = $('#btn-notify-label');

function renderNotifyButton() {
  if (!('Notification' in window)) {
    notifyBtn.hidden = true;
    return;
  }
  notifyBtn.hidden = false;
  const p = Notification.permission;
  notifyBtn.disabled = p === 'denied';
  notifyBtn.classList.toggle('btn--on', p === 'granted' && prefs.notify);
  notifyLabel.textContent =
    p === 'denied' ? 'Alerts blocked' : p === 'granted' ? (prefs.notify ? 'Alerts on' : 'Alerts off') : 'Enable alerts';
  notifyBtn.title =
    p === 'denied'
      ? 'Notifications are blocked for this page in the browser settings'
      : p === 'granted'
        ? 'Click to turn desktop alerts ' + (prefs.notify ? 'off' : 'on')
        : 'Get a desktop alert when an agent needs you';
}

notifyBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    prefs.notify = !prefs.notify;
  } else if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* old Safari: callback form only */
    }
    prefs.notify = true;
  }
  savePrefs();
  renderNotifyButton();
});

function notify(tile) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !prefs.notify) return;
  const n = tile.summary?.needsYou ?? 1;
  try {
    const note = new Notification(`${tile.office.name} needs you`, {
      body: n === 1 ? 'An agent is waiting for your answer.' : `${n} agents are waiting for your answer.`,
      tag: `habblaud-hub:${tile.id}`,
      icon: '/icons/icon-192.png',
    });
    note.onclick = () => {
      window.focus();
      spotlight(tile.id);
      note.close();
    };
  } catch {
    /* some platforms only allow notifications from a service worker */
  }
}

/* ---------- layout ---------- */

function spotlight(id, { auto = false } = {}) {
  if (!state.tiles.some((t) => t.id === id)) return;
  state.layout = 'spotlight';
  state.spotlightId = id;
  if (!auto) {
    prefs.layout = 'spotlight';
    prefs.spotlightId = id;
    savePrefs();
  }
  layout();
}

function showGrid() {
  state.layout = 'grid';
  prefs.layout = 'grid';
  savePrefs();
  layout();
}

/** Best grid for n tiles in w×h: the column count that gives the largest 16:10 frames. */
function gridRects(n, W, H) {
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (W - GAP * (cols - 1)) / cols;
    const cellH = (H - GAP * (rows - 1)) / rows;
    const frameW = Math.min(cellW, (cellH - LABEL_H) * FRAME_RATIO);
    if (frameW <= 0) continue;
    if (!best || frameW > best.frameW + 0.5) best = { cols, rows, cellW, cellH, frameW };
  }
  if (!best) best = { cols: n, rows: 1, cellW: W / n, cellH: H, frameW: W / n };

  // Fill the cell, but keep the frame between ~4:3 and ~2:1 so tiles stay close to 16:10.
  let { cellW: w, cellH: h } = best;
  const aspect = w / Math.max(1, h - LABEL_H);
  if (aspect > 2) w = (h - LABEL_H) * 2;
  else if (aspect < 1.33) h = w / 1.33 + LABEL_H;

  const rects = [];
  const totalH = best.rows * h + GAP * (best.rows - 1);
  const top0 = (H - totalH) / 2;
  for (let r = 0; r < best.rows; r++) {
    const inRow = Math.min(best.cols, n - r * best.cols);
    const rowW = inRow * w + GAP * (inRow - 1);
    const left0 = (W - rowW) / 2;
    for (let c = 0; c < inRow; c++) rects.push({ x: left0 + c * (w + GAP), y: top0 + r * (h + GAP), w, h });
  }
  return rects;
}

/** One big tile and a filmstrip on the right (wide windows) or along the bottom (tall/narrow ones). */
function spotlightRects(n, W, H) {
  if (n === 1) return { main: { x: 0, y: 0, w: W, h: H }, strip: [] };
  const others = n - 1;
  const side = W / H > 1.2 && W >= 720;
  const strip = [];
  let main;

  if (side) {
    const stripW = clamp(W * 0.2, 170, 340);
    let w = stripW;
    let h = w / FRAME_RATIO + LABEL_H;
    if (others * h + GAP * (others - 1) > H) {
      h = (H - GAP * (others - 1)) / others;
      w = Math.min(stripW, Math.max(0, h - LABEL_H) * FRAME_RATIO);
    }
    const total = others * h + GAP * (others - 1);
    const x = W - stripW + (stripW - w) / 2;
    let y = (H - total) / 2;
    for (let i = 0; i < others; i++, y += h + GAP) strip.push({ x, y, w, h });
    main = { x: 0, y: 0, w: W - stripW - GAP, h: H };
  } else {
    const stripH = clamp(H * 0.22, 110, 220);
    let h = stripH;
    let w = (h - LABEL_H) * FRAME_RATIO;
    if (others * w + GAP * (others - 1) > W) {
      w = (W - GAP * (others - 1)) / others;
      h = Math.min(stripH, w / FRAME_RATIO + LABEL_H);
    }
    const total = others * w + GAP * (others - 1);
    let x = (W - total) / 2;
    const y = H - stripH + (stripH - h) / 2;
    for (let i = 0; i < others; i++, x += w + GAP) strip.push({ x, y, w, h });
    main = { x: 0, y: 0, w: W, h: H - stripH - GAP };
  }
  return { main, strip };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function layout() {
  const tiles = state.tiles;
  if (!tiles.length) return;
  if (state.layout === 'spotlight' && !tiles.some((t) => t.id === state.spotlightId)) state.layout = 'grid';

  const W = stage.clientWidth;
  const H = stage.clientHeight;
  if (W <= 0 || H <= 0) return;

  let placed;
  if (state.layout === 'spotlight') {
    const { main, strip } = spotlightRects(tiles.length, W, H);
    const rest = tiles.filter((t) => t.id !== state.spotlightId);
    placed = [[tiles.find((t) => t.id === state.spotlightId), main], ...rest.map((t, i) => [t, strip[i]])];
  } else {
    const rects = gridRects(tiles.length, W, H);
    placed = tiles.map((t, i) => [t, rects[i]]);
  }

  for (const [tile, r] of placed) {
    const rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    const s = tile.el.style;
    s.left = `${rect.x}px`;
    s.top = `${rect.y}px`;
    s.width = `${rect.w}px`;
    s.height = `${rect.h}px`;
    const resized = !tile.rect || tile.rect.w !== rect.w || tile.rect.h !== rect.h;
    tile.rect = rect;
    const spot = state.layout === 'spotlight' && tile.id === state.spotlightId;
    tile.el.classList.toggle('tile--spot', spot);
    tile.el.classList.toggle('tile--thumb', state.layout === 'spotlight' && !spot);
    $('.tile__label', tile.el).title =
      spot ? 'Click to go back to the grid' : 'Click to spotlight · double-click for full screen';
    sendEmbed(tile);
    if (resized) scheduleOverview(tile);
  }

  document.body.dataset.layout = state.layout;
  $('#btn-grid').setAttribute('aria-checked', String(state.layout === 'grid'));
  $('#btn-spot').setAttribute('aria-checked', String(state.layout === 'spotlight'));
}

/* Reflow on resize, without the slide animation while the window is being dragged. */
let resizeTimer = 0;
new ResizeObserver(() => {
  document.body.classList.add('is-resizing');
  layout();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => document.body.classList.remove('is-resizing'), 160);
}).observe(stage);

document.addEventListener('fullscreenchange', () => {
  for (const t of state.tiles) {
    sendEmbed(t);
    scheduleOverview(t);
  }
});

/* ---------- top bar ---------- */

function renderTileCounts(tile) {
  const s = tile.summary;
  const el = tile.el;
  el.classList.toggle('tile--has-summary', Boolean(s));
  $('.cnt--agents b', el).textContent = String(s?.agents ?? 0);
  $('.cnt--agents', el).title = s ? `${s.agents} agents · ${s.subagents} subagents · ${s.rooms} rooms` : 'Agents';
  $('.cnt--working b', el).textContent = String(s?.working ?? 0);
  const needs = $('.tile__needs', el);
  const n = s?.needsYou ?? 0;
  needs.hidden = n === 0;
  needs.textContent = n === 1 ? '1 needs you' : `${n} need you`;
}

function renderTotals() {
  let online = 0;
  let agents = 0;
  let working = 0;
  let needs = 0;
  for (const t of state.tiles) {
    if (t.status === 'live' || t.status === 'stale') online++;
    if (t.summary && t.status !== 'offline') {
      agents += t.summary.agents;
      working += t.summary.working;
      needs += t.summary.needsYou;
    }
  }
  $('#t-online').textContent = `${online}/${state.tiles.length}`;
  $('#t-agents').textContent = String(agents);
  $('#t-working').textContent = String(working);
  $('#t-needs').textContent = String(needs);
  $('#t-needs-wrap').classList.toggle('stat--hot', needs > 0);
  document.title = needs > 0 ? `(${needs}) ${state.title}` : state.title;
}

$('#btn-grid').addEventListener('click', showGrid);
$('#btn-spot').addEventListener('click', () => {
  const id =
    state.tiles.find((t) => t.id === state.spotlightId)?.id ??
    state.tiles.find((t) => (t.summary?.needsYou ?? 0) > 0)?.id ??
    state.tiles[0]?.id;
  if (id) spotlight(id);
});

const autoSpot = $('#auto-spot');
autoSpot.checked = prefs.autoSpotlight;
autoSpot.addEventListener('change', () => {
  prefs.autoSpotlight = autoSpot.checked;
  savePrefs();
});

/* ---------- keyboard ---------- */

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (/^[1-9]$/.test(e.key)) {
    const tile = state.tiles[Number(e.key) - 1];
    if (tile) {
      e.preventDefault();
      spotlight(tile.id);
    }
  } else if (e.key === 'Escape' || e.key === 'g' || e.key === 'G') {
    if (document.fullscreenElement) return; // the browser handles Esc there
    if (state.layout !== 'grid') {
      e.preventDefault();
      showGrid();
    }
  }
});

/* ---------- health: stale, offline, retry ---------- */

/** Can we reach the office at all? A no-cors GET resolves on any HTTP answer and rejects when nothing listens. */
async function probe(tile) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(tile.office.url.href, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkTile(tile, now) {
  if (tile.probing) return;

  if (tile.status === 'offline') {
    if (now < tile.nextProbeAt) return;
    tile.probing = true;
    const ok = await probe(tile);
    tile.probing = false;
    if (ok) reloadFrame(tile);
    else {
      tile.retryDelay = Math.min(RETRY_MAX_MS, tile.retryDelay * 1.5);
      tile.nextProbeAt = Date.now() + tile.retryDelay;
    }
    return;
  }

  const since = tile.lastMsgAt || tile.loadStartedAt;
  const silentFor = now - since;

  if (tile.lastMsgAt === 0) {
    // Never heard from this load yet.
    if (silentFor < FIRST_CONTACT_MS || now < tile.nextProbeAt) return;
    tile.probing = true;
    const ok = await probe(tile);
    tile.probing = false;
    if (!ok) goOffline(tile);
    else {
      if (tile.status === 'loading') setStatus(tile, 'silent'); // the page is there, it just doesn't talk
      tile.nextProbeAt = Date.now() + RETRY_MAX_MS;
    }
    return;
  }

  if (silentFor > STALE_MS && tile.status === 'live') setStatus(tile, 'stale');
  if (silentFor > OFFLINE_AFTER_MS && now >= tile.nextProbeAt) {
    tile.probing = true;
    const ok = await probe(tile);
    tile.probing = false;
    if (!ok) goOffline(tile);
    else tile.nextProbeAt = Date.now() + RETRY_MAX_MS;
  }
}

function goOffline(tile) {
  tile.summary = null;
  renderTileCounts(tile);
  tile.el.classList.remove('tile--attention', 'tile--pulse');
  tile.nextProbeAt = Date.now() + tile.retryDelay;
  setStatus(tile, 'offline');
}

setInterval(() => {
  const now = Date.now();
  for (const t of state.tiles) checkTile(t, now);
}, 2000);

/* ---------- boot ---------- */

function showEmpty(message) {
  const el = $('#empty-tpl').content.firstElementChild.cloneNode(true);
  $('.card__text', el).textContent = message;
  stage.replaceChildren(el);
  document.body.dataset.layout = 'empty';
}

async function boot() {
  renderNotifyButton();
  let cfg;
  try {
    cfg = await loadConfig();
  } catch (err) {
    showEmpty(err.message);
    return;
  }
  state.title = cfg.title;
  $('#title').textContent = cfg.title;
  if (!cfg.offices.length) {
    showEmpty('config.json has no valid offices. Each needs at least a "url".');
    renderTotals();
    return;
  }

  state.tiles = cfg.offices.map((o, i) => createTile(o, i));
  if (prefs.layout === 'spotlight' && state.tiles.some((t) => t.id === prefs.spotlightId)) {
    state.layout = 'spotlight';
    state.spotlightId = prefs.spotlightId;
  }
  // First placement without the slide-in animation.
  document.body.classList.add('is-resizing');
  layout();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('is-resizing')));
  renderTotals();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('[hub] service worker:', err));
  });
}

boot();
