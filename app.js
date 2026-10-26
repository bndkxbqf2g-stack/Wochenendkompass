'use strict';
const CATS = {
  event: 'Veranstaltungen', gastro: 'Gastronomie', angebot: 'Angebote & Rabatte',
  natur: 'Wandern & Natur', weinbier: 'Wein & Bier', musik: 'Musik & Nachtleben',
  schlemmerblock: 'Schlemmerblock', sonstiges: 'Sonstiges'
};
const SOURCES = [
  ['Stadt Würzburg', 'https://www.wuerzburg.de'],
  ['Gemeinde Zellingen', 'https://www.zellingen.de'],
  ['Stadt Ochsenfurt', 'https://www.ochsenfurt.com'],
  ['Frankenwein-Frankenland', 'https://www.frankenwein-frankenland.de'],
  ['Schlemmerblock', 'https://www.schlemmerblock.de'],
  ['Resident Advisor (Clubs/DJs)', 'https://ra.co'],
  ['Eventim', 'https://www.eventim.de'],
  ['Reservix', 'https://www.reservix.de']
];
const HOME = 'Zellingen';
const K = { wishes: 'wk_wishes', items: 'wk_items', settings: 'wk_settings', queue: 'wk_queue', feed: 'wk_feedcache' };

const $ = (s, r = document) => r.querySelector(s);
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const state = {
  wishes: load(K.wishes, []),
  items: load(K.items, []),
  feed: load(K.feed, { updated: null, items: [] }),
  settings: load(K.settings, { feedUrl: '', apiUrl: '', apiToken: '' }),
  queue: load(K.queue, []),
  filter: 'alle', range: 'all', editing: null,
  sync: { text: 'nur lokal', cls: '' }
};

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'onclick') n.addEventListener('click', v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9äöüß ]/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- Datum / Sortierung ---------- */
function itemStart(it) {
  if (!it.date) return null;
  const d = new Date(it.date + 'T' + (it.time || '00:00'));
  return isNaN(d) ? null : d;
}
function isExpired(it) {
  const end = it.endDate ? new Date(it.endDate + 'T23:59') : itemStart(it);
  if (!end) return false;
  const limit = it.date && !it.time && !it.endDate ? new Date(it.date + 'T23:59') : end;
  return limit < new Date();
}
function inRange(it) {
  if (state.range === 'all') return true;
  const s = itemStart(it); if (!s) return false;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let to;
  if (state.range === 'weekend') {
    const day = (now.getDay() + 6) % 7; // Mo=0
    const from = new Date(now); from.setDate(now.getDate() + (day >= 5 ? -(day - 4) : 4 - day));
    to = new Date(from); to.setDate(from.getDate() + 3);
    return s >= from && s < to;
  }
  to = new Date(now); to.setDate(now.getDate() + Number(state.range) + 1);
  return s >= now && s < to;
}
function allItems() {
  const map = new Map();
  for (const it of [...(state.feed.items || []), ...state.items]) {
    const key = norm(it.title) + '|' + (it.date || '') + '|' + norm(it.place);
    if (!map.has(key)) map.set(key, it);
  }
  return [...map.values()];
}
function sorted(list) {
  return list.sort((a, b) => {
    const sa = itemStart(a), sb = itemStart(b);
    if (sa && sb) return sa - sb || (a.priority || 2) - (b.priority || 2);
    if (sa) return -1; if (sb) return 1;
    return (b.found || '').localeCompare(a.found || '');
  });
}

/* ---------- Karten ---------- */
function transitLink(it) {
  const dest = it.place || it.title;
  return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(HOME) +
    '&destination=' + encodeURIComponent(dest) + '&travelmode=transit';
}
function carLink(it) {
  return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(HOME) +
    '&destination=' + encodeURIComponent(it.place || it.title) + '&travelmode=driving';
}
function fmtDate(it) {
  const s = itemStart(it); if (!s) return 'Termin offen';
  const d = s.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  return it.time ? d + ', ' + it.time + ' Uhr' : d;
}
function card(it) {
  const tags = [el('span', { class: 'tag' }, CATS[it.category] || 'Sonstiges')];
  if (!it.verified) tags.push(el('span', { class: 'tag warn' }, 'ungeprüft'));
  if (it.soldOut) tags.push(el('span', { class: 'tag bad' }, 'ausverkauft'));
  const acts = [];
  const src = safeUrl(it.url), tk = safeUrl(it.ticketUrl);
  if (tk && !it.soldOut) acts.push(el('a', { href: tk, target: '_blank', rel: 'noopener' }, 'Tickets / Reservierung'));
  if (src) acts.push(el('a', { href: src, target: '_blank', rel: 'noopener' }, 'Originalquelle'));
  if (it.place) {
    acts.push(el('a', { href: transitLink(it), target: '_blank', rel: 'noopener' }, 'ÖPNV-Verbindung'));
    acts.push(el('a', { href: carLink(it), target: '_blank', rel: 'noopener' }, 'Auto'));
  }
  const c = el('article', { class: 'card' },
    el('div', {}, tags),
    el('h3', {}, it.title),
    el('div', { class: 'meta' }, fmtDate(it) + (it.place ? ' · ' + it.place : '')),
    it.price ? el('div', { class: 'meta' }, 'Preis: ' + it.price) : null,
    it.description ? el('p', { class: 'desc' }, it.description) : null,
    it.found ? el('div', { class: 'meta' }, 'Stand: ' + new Date(it.found).toLocaleDateString('de-DE')) : null,
    el('div', { class: 'actions' }, acts));
  if (it.local) {
    const del = el('button', { class: 'ghost danger sm', onclick: () => { state.items = state.items.filter(x => x.id !== it.id); save(K.items, state.items); render(); } }, 'Löschen');
    c.append(el('div', { class: 'actions' }, del));
  }
  return c;
}

/* ---------- Render ---------- */
function renderFilters() {
  const box = $('#filters'); box.replaceChildren();
  for (const [k, label] of [['alle', 'Alle'], ...Object.entries(CATS).filter(([k]) => k !== 'sonstiges')]) {
    box.append(el('button', { class: 'chip' + (state.filter === k ? ' on' : ''), onclick: () => { state.filter = k; render(); } }, label));
  }
}
function renderList() {
  const list = $('#list'); list.replaceChildren();
  const items = sorted(allItems().filter(it => !isExpired(it) && it.category !== 'schlemmerblock'
    && (state.filter === 'alle' || it.category === state.filter) && inRange(it)));
  items.forEach(it => list.append(card(it)));
  const e = $('#empty');
  e.hidden = items.length > 0;
  if (!items.length) {
    e.textContent = state.feed.updated || state.items.length
      ? 'Keine passenden Einträge für diesen Filter.'
      : 'Noch keine Empfehlungen. Der Feed ist leer – verbinde unter „Mehr“ dein Backend oder lege selbst Einträge an.';
  }
}
function renderSchlemmer() {
  const box = $('#schlemmerList'); box.replaceChildren();
  const items = sorted(allItems().filter(it => it.category === 'schlemmerblock' && !isExpired(it)));
  if (!items.length) box.append(el('p', { class: 'hint' }, 'Noch keine verifizierten Schlemmerblock-Einträge.'));
  items.forEach(it => box.append(card(it)));
}
function renderWishes() {
  const box = $('#wishList'); box.replaceChildren();
  const prio = { 1: 'Hoch', 2: 'Normal', 3: 'Niedrig' };
  const list = [...state.wishes].sort((a, b) => (b.active - a.active) || a.priority - b.priority);
  if (!list.length) box.append(el('p', { class: 'hint' }, 'Noch keine Recherchewünsche.'));
  for (const w of list) {
    const pend = state.queue.some(q => q.id === w.id);
    box.append(el('article', { class: 'card' + (w.active ? '' : ' paused') },
      el('h3', {}, w.text),
      el('div', { class: 'meta' }, `${CATS[w.category] || 'Sonstiges'} · ${w.region || 'ohne Region'} · Priorität ${prio[w.priority]}`),
      el('div', { class: 'meta' }, `${w.active ? 'Aktiv' : 'Pausiert'} · ${pend ? 'wartet auf Sync' : (w.syncedAt ? 'synchronisiert ' + new Date(w.syncedAt).toLocaleString('de-DE') : 'nur lokal')}` +
        (w.lastRun ? ' · letzter Lauf ' + new Date(w.lastRun).toLocaleString('de-DE') : ' · noch nicht verarbeitet')),
      el('div', { class: 'actions' },
        el('button', { class: 'ghost sm', onclick: () => toggleWish(w.id) }, w.active ? 'Pausieren' : 'Aktivieren'),
        el('button', { class: 'ghost sm', onclick: () => editWish(w.id) }, 'Bearbeiten'),
        el('button', { class: 'ghost sm danger', onclick: () => deleteWish(w.id) }, 'Löschen'))));
  }
}
function renderSources() {
  const ul = $('#sources'); ul.replaceChildren();
  SOURCES.forEach(([n, u]) => ul.append(el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener' }, n))));
}
function setSync(text, cls = '') { state.sync = { text, cls }; const s = $('#syncStatus'); s.textContent = text; s.className = 'sync ' + cls; }
function render() { renderFilters(); renderList(); renderSchlemmer(); renderWishes(); updateSyncBadge(); }
function updateSyncBadge() {
  if (!state.settings.apiUrl) return setSync('nur lokal');
  if (!navigator.onLine) return setSync(`offline · ${state.queue.length} offen`, 'pend');
  if (state.queue.length) return setSync(`${state.queue.length} warten`, 'pend');
  if (state.sync.cls === 'err') return;
  setSync('synchron', 'ok');
}

/* ---------- Wünsche ---------- */
function wishKey(w) { return norm(w.text) + '|' + w.category + '|' + norm(w.region); }
function queue(id, op) {
  state.queue = state.queue.filter(q => q.id !== id);
  state.queue.push({ id, op, at: new Date().toISOString() });
  save(K.queue, state.queue);
}
function persistWishes() { save(K.wishes, state.wishes); }
function toggleWish(id) {
  const w = state.wishes.find(x => x.id === id); if (!w) return;
  w.active = !w.active; w.updatedAt = new Date().toISOString(); persistWishes(); queue(id, 'put'); render(); sync();
}
function deleteWish(id) {
  if (!confirm('Wunsch löschen?')) return;
  state.wishes = state.wishes.filter(x => x.id !== id); persistWishes(); queue(id, 'delete'); render(); sync();
}
function editWish(id) {
  const w = state.wishes.find(x => x.id === id); if (!w) return;
  $('#wishId').value = id; $('#wishText').value = w.text; $('#wishCat').value = w.category;
  $('#wishPrio').value = w.priority; $('#wishRegion').value = w.region || '';
  $('#wishSave').textContent = 'Speichern'; $('#wishCancel').hidden = false;
  showTab('wuensche'); $('#wishText').focus();
}
function resetWishForm() {
  $('#wishForm').reset(); $('#wishId').value = ''; $('#wishRegion').value = 'Würzburg';
  $('#wishSave').textContent = 'Hinzufügen'; $('#wishCancel').hidden = true;
}
function submitWish(e) {
  e.preventDefault();
  const text = $('#wishText').value.trim().slice(0, 200); if (!text) return;
  const data = { text, category: $('#wishCat').value, priority: Number($('#wishPrio').value), region: $('#wishRegion').value.trim().slice(0, 80) };
  const id = $('#wishId').value;
  const dup = state.wishes.find(w => w.id !== id && wishKey(w) === wishKey(data));
  if (dup) { $('#wishMsg').textContent = 'Diesen Wunsch gibt es schon' + (dup.active ? '.' : ' (pausiert).'); return; }
  const now = new Date().toISOString();
  if (id) {
    Object.assign(state.wishes.find(w => w.id === id), data, { updatedAt: now });
    queue(id, 'put');
  } else {
    const w = { id: uid(), ...data, active: true, profile: 'gemeinsam', createdAt: now, updatedAt: now, lastRun: null, syncedAt: null };
    state.wishes.push(w); queue(w.id, 'put');
  }
  persistWishes(); resetWishForm(); $('#wishMsg').textContent = 'Gespeichert. Wird bei den nächsten Rechercheläufen berücksichtigt, sobald das Backend verbunden ist.';
  render(); sync();
}

/* ---------- Sync ---------- */
async function api(path, opts = {}) {
  const base = state.settings.apiUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (state.settings.apiToken) headers.Authorization = 'Bearer ' + state.settings.apiToken;
  const r = await fetch(base + path, { ...opts, headers });
  if (r.status === 401 || r.status === 403) throw new Error('Nicht autorisiert (Token prüfen)');
  if (!r.ok) throw new Error('Serverfehler ' + r.status);
  return r.status === 204 ? null : r.json();
}
let syncing = false;
async function sync() {
  if (!state.settings.apiUrl || syncing) { updateSyncBadge(); return; }
  if (!navigator.onLine) { updateSyncBadge(); return; }
  syncing = true; setSync('synchronisiere…', 'pend');
  try {
    for (const q of [...state.queue]) {
      if (q.op === 'delete') await api('/wishes/' + encodeURIComponent(q.id), { method: 'DELETE' });
      else { const w = state.wishes.find(x => x.id === q.id); if (w) await api('/wishes/' + encodeURIComponent(q.id), { method: 'PUT', body: JSON.stringify(w) }); }
      state.queue = state.queue.filter(x => x !== q); save(K.queue, state.queue);
      const w = state.wishes.find(x => x.id === q.id); if (w) w.syncedAt = new Date().toISOString();
    }
    const remote = await api('/wishes');
    mergeRemote(Array.isArray(remote) ? remote : (remote && remote.wishes) || []);
    persistWishes();
    state.sync.cls = ''; $('#syncDetail').textContent = 'Zuletzt synchronisiert: ' + new Date().toLocaleString('de-DE');
    setSync('synchron', 'ok');
  } catch (err) {
    state.sync.cls = 'err'; setSync('Sync-Fehler', 'err'); $('#syncDetail').textContent = err.message;
  } finally { syncing = false; render(); }
}
function mergeRemote(remote) {
  const pending = new Set(state.queue.map(q => q.id));
  const ids = new Set();
  for (const r of remote) {
    if (!r || !r.id || typeof r.text !== 'string') continue;
    ids.add(r.id);
    if (pending.has(r.id)) continue;
    const i = state.wishes.findIndex(w => w.id === r.id);
    const clean = { id: String(r.id), text: r.text.slice(0, 200), category: CATS[r.category] ? r.category : 'sonstiges', region: String(r.region || '').slice(0, 80), priority: [1, 2, 3].includes(r.priority) ? r.priority : 2, active: !!r.active, profile: r.profile || 'gemeinsam', createdAt: r.createdAt, updatedAt: r.updatedAt, lastRun: r.lastRun || null, syncedAt: new Date().toISOString() };
    if (i < 0) state.wishes.push(clean);
    else if (!state.wishes[i].updatedAt || (clean.updatedAt || '') >= state.wishes[i].updatedAt) state.wishes[i] = clean;
  }
  state.wishes = state.wishes.filter(w => ids.has(w.id) || pending.has(w.id) || !w.syncedAt);
}
async function refreshFeed() {
  const url = state.settings.feedUrl || 'data/feed.json';
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const f = await r.json();
    if (f && Array.isArray(f.items)) {
      const prevIds = new Set((state.feed.items || []).map(i => i.id));
      const fresh = f.items.filter(i => i.id && !prevIds.has(i.id));
      state.feed = f; save(K.feed, f);
      if (prevIds.size && fresh.length) inAppNotice(`${fresh.length} neue Empfehlung${fresh.length > 1 ? 'en' : ''}`);
    }
  } catch { /* offline: Cache bleibt */ }
  render();
}

/* ---------- Hinweise ---------- */
function inAppNotice(text) {
  const b = $('#banner'); b.textContent = text + ' – siehe „Entdecken“.'; b.hidden = false;
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    navigator.serviceWorker?.ready.then(r => r.showNotification('Wochenendkompass', { body: text, icon: 'icon-192.png' }));
  }
}
function pushInfo() {
  const p = $('#pushState'), b = $('#pushBtn');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    p.textContent = 'Dieses Gerät/dieser Browser unterstützt keine Web-Push-Hinweise. Neue Empfehlungen erscheinen als Hinweis im Kopfbereich der App. (Auf dem iPhone: App zuerst zum Home-Bildschirm hinzufügen.)';
    b.hidden = true; return;
  }
  p.textContent = 'Status: ' + ({ granted: 'erlaubt', denied: 'blockiert', default: 'noch nicht erlaubt' }[Notification.permission]) +
    '. Echter Hintergrund-Push benötigt ein Backend mit Push-Abonnement; ohne Backend gibt es nur den In-App-Hinweis beim Öffnen.';
}

/* ---------- Eintrag manuell ---------- */
function submitItem(e) {
  if (e.submitter && e.submitter.value !== 'ok') return;
  const title = $('#iTitle').value.trim(); if (!title) return;
  const it = {
    id: uid(), title, category: $('#iCat').value, price: $('#iPrice').value.trim(),
    date: $('#iDate').value || null, time: $('#iTime').value || null, place: $('#iPlace').value.trim(),
    description: $('#iDesc').value.trim(), url: $('#iUrl').value.trim(), verified: false, local: true, found: new Date().toISOString()
  };
  state.items.push(it); save(K.items, state.items); $('#itemForm').reset(); render();
}

/* ---------- Export / Import ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ wishes: state.wishes, items: state.items }, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'wochenendkompass-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.append(a); a.click(); a.remove();
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    let n = 0;
    for (const w of d.wishes || []) {
      if (typeof w.text !== 'string') continue;
      const c = { id: uid(), text: w.text.slice(0, 200), category: CATS[w.category] ? w.category : 'sonstiges', region: String(w.region || '').slice(0, 80), priority: [1, 2, 3].includes(w.priority) ? w.priority : 2, active: w.active !== false, profile: 'gemeinsam', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastRun: null, syncedAt: null };
      if (state.wishes.some(x => wishKey(x) === wishKey(c))) continue;
      state.wishes.push(c); queue(c.id, 'put'); n++;
    }
    for (const i of d.items || []) {
      if (typeof i.title !== 'string') continue;
      state.items.push({ ...i, id: uid(), local: true, title: i.title.slice(0, 120) }); n++;
    }
    persistWishes(); save(K.items, state.items); render(); sync();
    alert(n + ' Einträge importiert.');
  } catch { alert('Datei konnte nicht gelesen werden.'); }
}

/* ---------- Navigation ---------- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo(0, 0);
}

/* ---------- Start ---------- */
function init() {
  for (const sel of ['#wishCat', '#iCat'])
    for (const [k, v] of Object.entries(CATS)) $(sel).append(el('option', { value: k }, v));
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#range').addEventListener('change', e => { state.range = e.target.value; render(); });
  $('#wishForm').addEventListener('submit', submitWish);
  $('#wishCancel').addEventListener('click', () => { resetWishForm(); $('#wishMsg').textContent = ''; });
  $('#addItemBtn').addEventListener('click', () => $('#itemDialog').showModal());
  $('#itemForm').addEventListener('submit', submitItem);
  $('#feedUrl').value = state.settings.feedUrl; $('#apiUrl').value = state.settings.apiUrl; $('#apiToken').value = state.settings.apiToken;
  $('#saveSettings').addEventListener('click', () => {
    const f = $('#feedUrl').value.trim(), a = $('#apiUrl').value.trim();
    if ((f && !safeUrl(f) && !f.startsWith('data/')) || (a && !safeUrl(a))) { $('#syncDetail').textContent = 'Bitte gültige URLs eintragen.'; return; }
    state.settings = { feedUrl: f, apiUrl: a, apiToken: $('#apiToken').value };
    save(K.settings, state.settings); state.sync.cls = ''; refreshFeed(); sync();
  });
  $('#pushBtn').addEventListener('click', async () => { await Notification.requestPermission(); pushInfo(); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => e.target.files[0] && importData(e.target.files[0]));
  $('#banner').addEventListener('click', () => { $('#banner').hidden = true; });
  window.addEventListener('online', () => { sync(); refreshFeed(); });
  window.addEventListener('offline', updateSyncBadge);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshFeed(); sync(); } });
  renderSources(); pushInfo(); render(); refreshFeed(); sync();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
