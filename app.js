'use strict';
const CATS = {
  musik: 'Club · Party', event: 'Veranstaltung', gastro: 'Gastro', angebot: 'Angebot',
  weinbier: 'Wein & Bier', natur: 'Natur', schlemmerblock: 'Schlemmerblock', sonstiges: 'Sonstiges'
};
const FILTERS = [['alle', 'Alles'], ['neu', '🔔 Neu'], ['musik', 'Musik'], ['gastro', 'Gastro'], ['schlemmerblock', 'Schlemmerblock'],
  ['weinbier', 'Wein & Bier'], ['natur', 'Natur'], ['event', 'Events'], ['angebot', 'Angebote']];
const SOURCES = [
  ['Stadt Würzburg', 'https://www.wuerzburg.de'],
  ['Gemeinde Zellingen', 'https://www.zellingen.de'],
  ['Stadt Ochsenfurt', 'https://www.ochsenfurt.com'],
  ['Frankenwein-Frankenland', 'https://www.frankenwein-frankenland.de'],
  ['Schlemmerblock', 'https://www.schlemmerblock.de'],
  ['Regioactive (Clubs)', 'https://www.regioactive.de'],
  ['Resident Advisor', 'https://ra.co'],
  ['Eventfinder Würzburg', 'https://www.eventfinder.de/wuerzburg'],
  ['Eventim', 'https://www.eventim.de'],
  ['Reservix', 'https://www.reservix.de']
];
const HOME = 'Zellingen';
const REPO = 'bndkxbqf2g-stack/Wochenendkompass';
const K = { wishes: 'wk_wishes', items: 'wk_items', settings: 'wk_settings', queue: 'wk_queue', feed: 'wk_feedcache', favs: 'wk_favs', seen: 'wk_seen' };

const $ = (s, r = document) => r.querySelector(s);
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const state = {
  wishes: load(K.wishes, []), items: load(K.items, []),
  feed: load(K.feed, { updated: null, items: [] }),
  settings: load(K.settings, { feedUrl: '', apiUrl: '', apiToken: '' }),
  queue: load(K.queue, []), favs: load(K.favs, []),
  filter: 'alle', range: 'all', syncErr: false
};

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'onclick') n.addEventListener('click', v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9äöüß ]/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- Datum / Sortierung ---------- */
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
function itemStart(it) {
  if (!it.date) return null;
  const d = new Date(it.date + 'T' + (it.time || '00:00'));
  return isNaN(d) ? null : d;
}
function isExpired(it) {
  const end = it.endDate || it.date;
  return !!end && end < todayStr();
}
function inRange(it) {
  if (state.range === 'all') return true;
  const s = itemStart(it); if (!s) return false;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (state.range === 'weekend') {
    const day = (now.getDay() + 6) % 7;
    const from = new Date(now); from.setDate(now.getDate() + (day >= 5 ? -(day - 4) : 4 - day));
    const to = new Date(from); to.setDate(from.getDate() + 3);
    return s >= from && s < to;
  }
  const to = new Date(now); to.setDate(now.getDate() + Number(state.range) + 1);
  return s >= now && s < to;
}
function isNew(it) {
  if ((state.feed.newIds || []).includes(it.id)) return true;
  return !!it.found && Date.now() - new Date(it.found) < 7 * 864e5 && !it.local;
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
const mapsBack = it => 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(it.place || it.title) +
  '&destination=' + encodeURIComponent(HOME) + '&travelmode=transit';
const mapsDir = (it, mode) => 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(HOME) +
  '&destination=' + encodeURIComponent(it.place || it.title) + '&travelmode=' + mode;
function fmtDate(it) {
  const s = itemStart(it); if (!s) return 'Termin offen';
  const wd = s.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  const d = s.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${wd} · ${d}` + (it.time ? ` · ab ${it.time} Uhr` : '');
}
function toggleFav(id) {
  state.favs = state.favs.includes(id) ? state.favs.filter(x => x !== id) : [...state.favs, id];
  save(K.favs, state.favs); render();
}
function card(it) {
  const tags = [];
  if (isNew(it)) tags.push(el('span', { class: 'tag blue' }, '🔔 Neu'));
  if (it.soldOut) tags.push(el('span', { class: 'tag bad' }, 'Ausverkauft'));
  else if (!it.verified) tags.push(el('span', { class: 'tag warn' }, 'Ungeprüft'));
  const src = safeUrl(it.url), tk = safeUrl(it.ticketUrl);
  const acts = [];
  if (src) acts.push(el('a', { class: 'main', href: src, target: '_blank', rel: 'noopener' }, 'Offizielle Eventseite'));
  if (tk && !it.soldOut) acts.push(el('a', { href: tk, target: '_blank', rel: 'noopener' }, 'Tickets'));
  if (it.place) {
    acts.push(el('a', { href: mapsDir(it, 'transit'), target: '_blank', rel: 'noopener' }, 'ÖPNV ab ' + HOME));
    acts.push(el('a', { href: mapsDir(it, 'driving'), target: '_blank', rel: 'noopener' }, 'Auto'));
    if (it.time && it.time >= '18:00') acts.push(el('a', { href: mapsBack(it), target: '_blank', rel: 'noopener' }, 'Rückfahrt nach ' + HOME));
  }
  const fav = state.favs.includes(it.id);
  const c = el('article', { class: 'card' },
    el('div', { class: 'topline' },
      el('span', { class: 'cat' }, (CATS[it.category] || 'Sonstiges') + (it.organizer ? ' · ' + it.organizer : '')),
      el('button', { class: 'heart' + (fav ? ' on' : ''), 'aria-label': 'Merken', onclick: () => toggleFav(it.id) }, fav ? '♥' : '♡')),
    tags.length ? el('div', { class: 'tags' }, tags) : null,
    el('div', { class: 'title' }, it.title),
    it.description ? el('p', { class: 'desc' }, it.description) : null,
    el('span', { class: 'pill' }, '🕘 ' + fmtDate(it)),
    it.place ? el('span', { class: 'pill' }, '📍 ' + it.place) : null,
    it.price ? el('span', { class: 'pill price' }, '€ ' + it.price) : null,
    it.soldOut ? el('span', { class: 'pill warn' }, 'Laut Quelle ausverkauft') : null,
    el('div', { class: 'actions' }, acts),
    it.found ? el('div', { class: 'meta' }, 'Gefunden: ' + new Date(it.found).toLocaleDateString('de-DE')) : null);
  if (it.local) c.append(el('div', { class: 'actions' }, el('button', { class: 'sm danger', onclick: () => { state.items = state.items.filter(x => x.id !== it.id); save(K.items, state.items); render(); } }, 'Löschen')));
  return c;
}

/* ---------- Render ---------- */
function visible() { return allItems().filter(it => !isExpired(it)); }
function renderFilters() {
  const box = $('#filters'); box.replaceChildren();
  for (const [k, label] of FILTERS) box.append(el('button', { class: 'chip' + (state.filter === k ? ' on' : ''), onclick: () => { state.filter = k; render(); } }, label));
}
function renderHeader() {
  const u = state.feed.updated;
  const n = new Set(visible().map(i => { try { return new URL(i.url).hostname; } catch { return ''; } }).filter(Boolean)).size;
  $('#checked').textContent = u
    ? `Zuletzt geprüft: ${new Date(u).toLocaleString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr · ${n} Quelle${n === 1 ? '' : 'n'}`
    : 'Noch nicht geprüft';
  const fresh = visible().filter(isNew).length;
  const b = $('#newBanner');
  b.hidden = !fresh;
  b.textContent = fresh ? `${fresh} neue oder geänderte Tipp${fresh > 1 ? 's sind' : ' ist'} markiert – prüft frühzeitig Tickets, Plätze und Bedingungen.` : '';
}
function renderList() {
  const list = $('#list'); list.replaceChildren();
  const items = sorted(visible().filter(it =>
    (state.filter === 'alle' || (state.filter === 'neu' ? isNew(it) : it.category === state.filter)) && inRange(it)));
  items.forEach(it => list.append(card(it)));
  const e = $('#empty'); e.hidden = items.length > 0;
  if (!items.length) e.textContent = state.feed.updated || state.items.length ? 'Keine passenden Tipps für diesen Filter.' : 'Noch keine Tipps. Tippe oben auf „Jetzt aktualisieren“.';
}
function renderFavs() {
  const box = $('#favList'); box.replaceChildren();
  const items = sorted(visible().filter(it => state.favs.includes(it.id)));
  items.forEach(it => box.append(card(it)));
  $('#favEmpty').hidden = items.length > 0;
}
const PRIO = { 1: 'hoch', 2: 'mittel', 3: 'niedrig' };
function renderWishes() {
  const box = $('#wishList'); box.replaceChildren();
  const list = [...state.wishes].sort((a, b) => (b.active - a.active) || a.priority - b.priority);
  for (const w of list) {
    const pend = state.queue.some(q => q.id === w.id);
    box.append(el('div', { class: 'wish' + (w.active ? '' : ' paused') },
      el('div', {}, el('b', {}, w.text),
        el('small', {}, `${CATS[w.category] || 'Allgemein'} · ${w.region || 'ohne Region'} · Priorität ${PRIO[w.priority]}${w.lastRun ? ' · zuletzt ' + new Date(w.lastRun).toLocaleDateString('de-DE') : ''}${pend ? ' · wartet auf Sync' : ''}`),
        w.active ? el('div', {}, el('a', { href: centralLink(w), target: '_blank', rel: 'noopener' }, 'Zentral eintragen')) : null),
      el('div', { class: 'btns' },
        el('button', { class: 'sm', type: 'button', onclick: () => toggleWish(w.id) }, w.active ? 'Pause' : 'Start'),
        el('button', { class: 'sm', type: 'button', 'aria-label': 'Bearbeiten', onclick: () => editWish(w.id) }, '✎'),
        el('button', { class: 'sm', type: 'button', 'aria-label': 'Löschen', onclick: () => deleteWish(w.id) }, '×'))));
  }
}
function centralLink(w) {
  const body = `Kategorie: ${w.category}\nRegion: ${w.region || ''}\nPriorität: ${w.priority}`;
  return `https://github.com/${REPO}/issues/new?labels=wunsch&title=${encodeURIComponent(w.text)}&body=${encodeURIComponent(body)}`;
}
function renderSources() {
  const ul = $('#sources'); ul.replaceChildren();
  SOURCES.forEach(([n, u]) => ul.append(el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener' }, n))));
}
function setSync(text, cls = '') { const s = $('#syncStatus'); s.className = 'status ' + cls; s.querySelector('span').textContent = text; }
function updateSyncBadge() {
  if (!state.settings.apiUrl) return setSync('Nur auf diesem Gerät · zentrale Wünsche per „Zentral eintragen“');
  if (state.syncErr) return setSync('Sync-Fehler', 'err');
  if (!navigator.onLine) return setSync(`Offline · ${state.queue.length} offen`, 'pend');
  if (state.queue.length) return setSync(`${state.queue.length} Änderung(en) warten`, 'pend');
  setSync('Synchronisiert · gemeinsames Profil geladen');
}
function render() { renderFilters(); renderHeader(); renderList(); renderFavs(); renderWishes(); updateSyncBadge(); }

/* ---------- Wünsche ---------- */
const wishKey = w => norm(w.text) + '|' + w.category + '|' + norm(w.region);
function queue(id, op) {
  state.queue = state.queue.filter(q => q.id !== id);
  state.queue.push({ id, op, at: new Date().toISOString() });
  save(K.queue, state.queue);
}
const persistWishes = () => save(K.wishes, state.wishes);
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
  $('#wishSave').textContent = 'Änderung speichern'; $('#wishCancel').hidden = false; $('#wishText').focus();
}
function resetWishForm() {
  $('#wishForm').reset(); $('#wishId').value = ''; $('#wishRegion').value = 'Würzburg';
  $('#wishSave').textContent = '+ Recherchewunsch speichern'; $('#wishCancel').hidden = true;
}
function submitWish(e) {
  e.preventDefault();
  const text = $('#wishText').value.trim().slice(0, 200); if (!text) return;
  const data = { text, category: $('#wishCat').value, priority: Number($('#wishPrio').value), region: $('#wishRegion').value.trim().slice(0, 80) };
  const id = $('#wishId').value;
  const dup = state.wishes.find(w => w.id !== id && wishKey(w) === wishKey(data));
  if (dup) { $('#wishMsg').textContent = 'Diesen Wunsch gibt es schon' + (dup.active ? '.' : ' (pausiert).'); return; }
  const now = new Date().toISOString();
  if (id) { Object.assign(state.wishes.find(w => w.id === id), data, { updatedAt: now }); queue(id, 'put'); }
  else { const w = { id: uid(), ...data, active: true, profile: 'gemeinsam', createdAt: now, updatedAt: now, lastRun: null, syncedAt: null }; state.wishes.push(w); queue(w.id, 'put'); }
  persistWishes(); resetWishForm();
  $('#wishMsg').textContent = 'Gespeichert. Damit die tägliche Recherche den Wunsch nutzt, tippe beim Wunsch auf „Zentral eintragen“ und sende das GitHub-Issue ab.';
  render(); sync();
}
function copyProfile() {
  const txt = state.wishes.filter(w => w.active).map(w => `- ${w.text} (${CATS[w.category] || 'Allgemein'}, ${w.region || '–'}, Priorität ${PRIO[w.priority]})`).join('\n') || 'Keine aktiven Wünsche.';
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { $('#wishMsg').textContent = 'Rechercheprofil kopiert.'; }, () => { $('#wishMsg').textContent = txt; });
}

/* ---------- Sync (optionales Backend) ---------- */
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
  if (!state.settings.apiUrl || syncing || !navigator.onLine) { updateSyncBadge(); return; }
  syncing = true; setSync('Synchronisiere…', 'pend');
  try {
    for (const q of [...state.queue]) {
      if (q.op === 'delete') await api('/wishes/' + encodeURIComponent(q.id), { method: 'DELETE' });
      else { const w = state.wishes.find(x => x.id === q.id); if (w) await api('/wishes/' + encodeURIComponent(q.id), { method: 'PUT', body: JSON.stringify(w) }); }
      state.queue = state.queue.filter(x => x !== q); save(K.queue, state.queue);
      const w = state.wishes.find(x => x.id === q.id); if (w) w.syncedAt = new Date().toISOString();
    }
    const remote = await api('/wishes');
    mergeRemote(Array.isArray(remote) ? remote : (remote && remote.wishes) || []);
    persistWishes(); state.syncErr = false;
    $('#syncDetail').textContent = 'Zuletzt synchronisiert: ' + new Date().toLocaleString('de-DE');
  } catch (err) { state.syncErr = true; $('#syncDetail').textContent = err.message; }
  finally { syncing = false; render(); }
}
function mergeRemote(remote) {
  const pending = new Set(state.queue.map(q => q.id)), ids = new Set();
  for (const r of remote) {
    if (!r || !r.id || typeof r.text !== 'string') continue;
    ids.add(r.id); if (pending.has(r.id)) continue;
    const i = state.wishes.findIndex(w => w.id === r.id);
    const clean = { id: String(r.id), text: r.text.slice(0, 200), category: CATS[r.category] ? r.category : 'sonstiges', region: String(r.region || '').slice(0, 80), priority: [1, 2, 3].includes(r.priority) ? r.priority : 2, active: !!r.active, profile: r.profile || 'gemeinsam', createdAt: r.createdAt, updatedAt: r.updatedAt, lastRun: r.lastRun || null, syncedAt: new Date().toISOString() };
    if (i < 0) state.wishes.push(clean);
    else if (!state.wishes[i].updatedAt || (clean.updatedAt || '') >= state.wishes[i].updatedAt) state.wishes[i] = clean;
  }
  state.wishes = state.wishes.filter(w => ids.has(w.id) || pending.has(w.id) || !w.syncedAt);
}

/* ---------- Feed ---------- */
async function refreshFeed(manual) {
  const url = state.settings.feedUrl || 'data/feed.json';
  const btn = $('#updateBtn'); if (manual) btn.textContent = '⟳ Prüfe…';
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const f = await r.json();
    if (f && Array.isArray(f.items)) {
      const seen = new Set(load(K.seen, []));
      const fresh = f.items.filter(i => i.id && !seen.has(i.id));
      state.feed = f; save(K.feed, f);
      if (seen.size && fresh.length) inAppNotice(`${fresh.length} neue Tipps im Wochenendkompass`);
      save(K.seen, f.items.map(i => i.id).filter(Boolean));
    }
    if (manual) btn.textContent = '✓ Aktuell';
  } catch { if (manual) btn.textContent = 'Offline – gespeicherte Tipps'; }
  setTimeout(() => { btn.textContent = '⟳ Jetzt aktualisieren'; }, 2500);
  render();
}
function inAppNotice(text) {
  const b = $('#newBanner'); b.textContent = text; b.hidden = false;
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden)
    navigator.serviceWorker?.ready.then(r => r.showNotification('Wochenendkompass', { body: text, icon: 'icon-192.png' }));
}
function pushInfo() {
  const p = $('#pushState'), b = $('#pushBtn');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    p.textContent = 'Dieser Browser unterstützt keine Hinweise. Neue Tipps werden beim Öffnen oben markiert. (iPhone: App zuerst zum Home-Bildschirm hinzufügen.)'; b.hidden = true; return;
  }
  p.textContent = 'Status: ' + ({ granted: 'erlaubt', denied: 'blockiert', default: 'noch nicht erlaubt' }[Notification.permission]) +
    '. Hintergrund-Push ist noch nicht eingerichtet; bis dahin gibt es Hinweise in der App und per Claude-Benachrichtigung.';
}

/* ---------- Eigener Tipp, Export/Import ---------- */
function submitItem(e) {
  if (e.submitter && e.submitter.value !== 'ok') return;
  const title = $('#iTitle').value.trim(); if (!title) return;
  state.items.push({ id: uid(), title, category: $('#iCat').value, price: $('#iPrice').value.trim(), date: $('#iDate').value || null, time: $('#iTime').value || null, place: $('#iPlace').value.trim(), description: $('#iDesc').value.trim(), url: $('#iUrl').value.trim(), verified: false, local: true, found: new Date().toISOString() });
  save(K.items, state.items); $('#itemForm').reset(); render();
}
function exportData() {
  const blob = new Blob([JSON.stringify({ wishes: state.wishes, items: state.items, favs: state.favs }, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'wochenendkompass-' + todayStr() + '.json' });
  document.body.append(a); a.click(); a.remove();
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text()); let n = 0;
    for (const w of d.wishes || []) {
      if (typeof w.text !== 'string') continue;
      const c = { id: uid(), text: w.text.slice(0, 200), category: CATS[w.category] ? w.category : 'sonstiges', region: String(w.region || '').slice(0, 80), priority: [1, 2, 3].includes(w.priority) ? w.priority : 2, active: w.active !== false, profile: 'gemeinsam', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastRun: null, syncedAt: null };
      if (state.wishes.some(x => wishKey(x) === wishKey(c))) continue;
      state.wishes.push(c); queue(c.id, 'put'); n++;
    }
    for (const i of d.items || []) { if (typeof i.title === 'string') { state.items.push({ ...i, id: uid(), local: true, title: i.title.slice(0, 120) }); n++; } }
    persistWishes(); save(K.items, state.items); render(); sync(); alert(n + ' Einträge importiert.');
  } catch { alert('Datei konnte nicht gelesen werden.'); }
}

/* ---------- Navigation / Start ---------- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo(0, 0);
}
function init() {
  for (const [sel, skip] of [['#wishCat', false], ['#iCat', false]]) for (const [k, v] of Object.entries(CATS)) $(sel).append(el('option', { value: k }, v));
  $('#wishCat').prepend(el('option', { value: 'sonstiges' }, 'Allgemein')); $('#wishCat').value = 'sonstiges';
  $('#wishCat').querySelectorAll('option[value="sonstiges"]')[1]?.remove();
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#range').addEventListener('change', e => { state.range = e.target.value; render(); });
  $('#wishForm').addEventListener('submit', submitWish);
  $('#wishCancel').addEventListener('click', () => { resetWishForm(); $('#wishMsg').textContent = ''; });
  $('#copyProfile').addEventListener('click', copyProfile);
  $('#updateBtn').addEventListener('click', () => refreshFeed(true));
  $('#refreshIcon').addEventListener('click', () => refreshFeed(true));
  $('#addItemBtn').addEventListener('click', () => $('#itemDialog').showModal());
  $('#itemForm').addEventListener('submit', submitItem);
  $('#feedUrl').value = state.settings.feedUrl; $('#apiUrl').value = state.settings.apiUrl; $('#apiToken').value = state.settings.apiToken;
  $('#saveSettings').addEventListener('click', () => {
    const f = $('#feedUrl').value.trim(), a = $('#apiUrl').value.trim();
    if ((f && !safeUrl(f) && !f.startsWith('data/')) || (a && !safeUrl(a))) { $('#syncDetail').textContent = 'Bitte gültige URLs eintragen.'; return; }
    state.settings = { feedUrl: f, apiUrl: a, apiToken: $('#apiToken').value }; save(K.settings, state.settings); state.syncErr = false; refreshFeed(); sync();
  });
  $('#pushBtn').addEventListener('click', async () => { await Notification.requestPermission(); pushInfo(); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => e.target.files[0] && importData(e.target.files[0]));
  window.addEventListener('online', () => { sync(); refreshFeed(); });
  window.addEventListener('offline', updateSyncBadge);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshFeed(); sync(); } });
  renderSources(); pushInfo(); render(); refreshFeed(); sync();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
