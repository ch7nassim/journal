'use strict';

const PIN_KEY = 'journal_pin';

let state = {
  entries: [],
  currentId: null,
  pinBuffer: '',
  isSettingPin: false,
  pendingPin: '',
  searchQuery: '',
};

// ── INDEXEDDB STORAGE ─────────────────────────────────────────────────────────

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('MonJournal', 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('entries')) {
        d.createObjectStore('entries', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings');
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function txEntries(mode) {
  return db.transaction('entries', mode).objectStore('entries');
}

function txSettings(mode) {
  return db.transaction('settings', mode).objectStore('settings');
}

function loadEntries() {
  return new Promise(resolve => {
    const req = txEntries('readonly').getAll();
    req.onsuccess = () => { state.entries = req.result || []; resolve(); };
    req.onerror = () => { state.entries = []; resolve(); };
  });
}

function saveEntry_db(entry) {
  return new Promise((resolve, reject) => {
    const req = txEntries('readwrite').put(entry);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

function deleteEntry_db(id) {
  return new Promise((resolve, reject) => {
    const req = txEntries('readwrite').delete(id);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

function getPin() {
  return new Promise(resolve => {
    const req = txSettings('readonly').get('pin');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function setPin(p) {
  return new Promise((resolve, reject) => {
    const req = txSettings('readwrite').put(p, 'pin');
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

// ── PIN / LOCK ────────────────────────────────────────────────────────────────

async function showLock() {
  document.getElementById('lock-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
  state.pinBuffer = '';
  updateDots();
  const hasPin = !!(await getPin());
  document.getElementById('lock-subtitle').textContent = hasPin
    ? 'Entrez votre code PIN' : 'Créez un code PIN';
  document.getElementById('first-time-hint').style.display = hasPin ? 'none' : 'block';
}

function showApp() {
  document.getElementById('lock-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
}

function updateDots() {
  document.querySelectorAll('#pin-dots span').forEach((s, i) => {
    s.classList.toggle('filled', i < state.pinBuffer.length);
    s.classList.remove('error');
  });
}

function triggerError() {
  document.querySelectorAll('#pin-dots span').forEach(s => {
    s.classList.remove('filled');
    s.classList.add('error');
  });
  state.pinBuffer = '';
  setTimeout(updateDots, 600);
}

async function handlePin(num) {
  if (state.pinBuffer.length >= 4) return;
  state.pinBuffer += num;
  updateDots();
  if (state.pinBuffer.length < 4) return;

  const stored = await getPin();

  if (!stored) {
    if (!state.isSettingPin) {
      state.isSettingPin = true;
      state.pendingPin = state.pinBuffer;
      state.pinBuffer = '';
      document.getElementById('lock-subtitle').textContent = 'Confirmez votre code PIN';
      document.getElementById('first-time-hint').style.display = 'none';
      updateDots();
    } else {
      if (state.pinBuffer === state.pendingPin) {
        await setPin(state.pinBuffer);
        state.isSettingPin = false;
        showApp();
      } else {
        triggerError();
        document.getElementById('lock-subtitle').textContent = 'Codes différents. Réessayez.';
        setTimeout(() => {
          state.isSettingPin = false;
          state.pendingPin = '';
          document.getElementById('lock-subtitle').textContent = 'Créez un code PIN';
          document.getElementById('first-time-hint').style.display = 'block';
        }, 800);
      }
    }
  } else {
    if (state.pinBuffer === stored) {
      showApp();
    } else {
      triggerError();
      document.getElementById('lock-subtitle').textContent = 'Code incorrect';
      setTimeout(() => {
        document.getElementById('lock-subtitle').textContent = 'Entrez votre code PIN';
      }, 1200);
    }
  }
}

// ── DATES ──────────────────────────────────────────────────────────────────

function formatDateFull(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateCard(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff/60)} min`;
  if (diff < 86400 && d.toDateString() === now.toDateString()) {
    return `Aujourd'hui ${d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`;
  }
  const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Hier ${d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`;
  }
  return d.toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit'});
}

function formatMonthHeader(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
}

// ── HIGHLIGHT ──────────────────────────────────────────────────────────────

function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const re = new RegExp(`(${escapeRe(query)})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

// ── RENDER LIST ────────────────────────────────────────────────────────────

function renderList() {
  const container = document.getElementById('entries-container');
  const emptyState = document.getElementById('empty-state');
  const noResults = document.getElementById('no-results');
  container.innerHTML = '';

  const q = state.searchQuery.trim().toLowerCase();
  let filtered = [...state.entries].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (q) {
    filtered = filtered.filter(e =>
      (e.title||'').toLowerCase().includes(q) ||
      (e.content||'').toLowerCase().includes(q)
    );
  }

  const hasAny = state.entries.length > 0;
  const hasResults = filtered.length > 0;

  emptyState.classList.toggle('hidden', hasAny || q.length > 0);
  noResults.classList.toggle('hidden', !(q && !hasResults));

  if (!hasResults) return;

  let lastMonth = '';
  filtered.forEach(entry => {
    const month = formatMonthHeader(entry.updatedAt);
    if (month !== lastMonth) {
      const header = document.createElement('div');
      header.className = 'month-header';
      header.textContent = month;
      container.appendChild(header);
      lastMonth = month;
    }

    const card = document.createElement('div');
    card.className = 'entry-card';
    card.dataset.id = entry.id;

    const hasTitle = entry.title && entry.title.trim();
    const preview = (entry.content || '').slice(0, 160).replace(/\n/g, ' ');

    card.innerHTML = `
      <div class="entry-date">${formatDateCard(entry.updatedAt)}</div>
      ${hasTitle ? `<div class="entry-title-text">${highlight(entry.title, q)}</div>` : ''}
      <div class="entry-preview ${hasTitle ? '' : 'no-title'}">${highlight(preview || 'Entrée vide', q)}</div>
    `;
    card.addEventListener('click', () => openEntry(entry.id));
    container.appendChild(card);
  });
}

// ── EDIT ────────────────────────────────────────────────────────────────────

function openEntry(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;
  state.currentId = id;
  document.getElementById('entry-title').value = entry.title || '';
  document.getElementById('entry-content').value = entry.content || '';
  document.getElementById('date-display').textContent = formatDateFull(entry.createdAt);
  document.getElementById('btn-delete').style.display = 'flex';
  document.getElementById('btn-export-one').style.display = 'flex';
  showEditView();
}

function newEntry() {
  state.currentId = null;
  document.getElementById('entry-title').value = '';
  document.getElementById('entry-content').value = '';
  document.getElementById('date-display').textContent = formatDateFull(new Date().toISOString());
  document.getElementById('btn-delete').style.display = 'none';
  document.getElementById('btn-export-one').style.display = 'none';
  showEditView();
  setTimeout(() => document.getElementById('entry-content').focus(), 100);
}

async function saveEntry() {
  const title = document.getElementById('entry-title').value.trim();
  const content = document.getElementById('entry-content').value.trim();
  if (!title && !content) return showList();

  const now = new Date().toISOString();
  let entry;
  if (state.currentId) {
    const idx = state.entries.findIndex(e => e.id === state.currentId);
    if (idx >= 0) {
      entry = { ...state.entries[idx], title, content, updatedAt: now };
      state.entries[idx] = entry;
    }
  } else {
    entry = { id: Date.now().toString(), title, content, createdAt: now, updatedAt: now };
    state.entries.unshift(entry);
  }
  await saveEntry_db(entry);
  showList();
}

async function deleteEntry() {
  if (!state.currentId) return;
  if (!confirm('Supprimer cette entrée ?')) return;
  await deleteEntry_db(state.currentId);
  state.entries = state.entries.filter(e => e.id !== state.currentId);
  showList();
}

// ── NAVIGATION ──────────────────────────────────────────────────────────────

function showEditView() {
  document.getElementById('list-view').classList.remove('active');
  document.getElementById('edit-view').classList.add('active');
  document.getElementById('btn-new').style.display = 'none';
  document.getElementById('search-bar').classList.add('hidden');
}

function showList() {
  document.getElementById('edit-view').classList.remove('active');
  document.getElementById('list-view').classList.add('active');
  document.getElementById('btn-new').style.display = 'flex';
  renderList();
}

// ── INIT ────────────────────────────────────────────────────────────────────

async function init() {
  // Theme
  const savedTheme = await getSavedTheme();
  applyTheme(savedTheme);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // Export
  document.getElementById('btn-export-all').addEventListener('click', exportAll);
  document.getElementById('btn-export-one').addEventListener('click', exportOne);

  await openDB();
  await loadEntries();

  // Numpad
  document.querySelectorAll('.num-btn[data-num]').forEach(btn => {
    btn.addEventListener('click', () => handlePin(btn.dataset.num));
  });
  document.getElementById('del-btn').addEventListener('click', () => {
    state.pinBuffer = state.pinBuffer.slice(0, -1);
    updateDots();
  });

  // Lock / Unlock
  document.getElementById('btn-lock').addEventListener('click', showLock);

  // FAB
  document.getElementById('btn-new').addEventListener('click', newEntry);

  // Save / Back / Delete
  document.getElementById('btn-save').addEventListener('click', saveEntry);
  document.getElementById('btn-back').addEventListener('click', showList);
  document.getElementById('btn-delete').addEventListener('click', deleteEntry);

  // Search
  document.getElementById('btn-search-toggle').addEventListener('click', () => {
    document.getElementById('search-bar').classList.remove('hidden');
    document.getElementById('search-input').focus();
  });
  document.getElementById('btn-search-close').addEventListener('click', () => {
    document.getElementById('search-bar').classList.add('hidden');
    document.getElementById('search-input').value = '';
    state.searchQuery = '';
    renderList();
  });
  document.getElementById('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderList();
  });

  showLock();
}

document.addEventListener('DOMContentLoaded', init);

// ── THEME ─────────────────────────────────────────────────────────────────────

function getSavedTheme() {
  return new Promise(resolve => {
    const req = txSettings('readonly').get('theme');
    req.onsuccess = () => resolve(req.result || 'dark');
    req.onerror = () => resolve('dark');
  });
}

function saveTheme(theme) {
  txSettings('readwrite').put(theme, 'theme');
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  document.body.classList.toggle('light', theme === 'light');
  document.getElementById('icon-moon').style.display = theme === 'dark' ? 'block' : 'none';
  document.getElementById('icon-sun').style.display = theme === 'light' ? 'block' : 'none';
}

function toggleTheme() {
  const isDark = document.body.classList.contains('dark');
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  saveTheme(newTheme);
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportOne() {
  const entry = state.entries.find(e => e.id === state.currentId);
  if (!entry) return;
  const d = new Date(entry.createdAt);
  const dateStr = d.toLocaleDateString('fr-FR', {year:'numeric', month:'2-digit', day:'2-digit'}).replace(/\//g,'-');
  const title = (entry.title || 'note').replace(/[^a-zA-Z0-9\u00C0-\u024F _-]/g, '').trim() || 'note';
  const content = [
    entry.title ? `# ${entry.title}` : '',
    `Date : ${formatDateFull(entry.createdAt)}`,
    '',
    entry.content || ''
  ].filter((l, i) => !(i === 0 && !l)).join('\n');
  downloadText(`journal_${dateStr}_${title}.txt`, content);
  showToast('Note exportée ✓');
}

function exportAll() {
  if (!state.entries.length) { showToast('Aucune note à exporter'); return; }
  const sorted = [...state.entries].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const lines = ['MON JOURNAL — Export complet', `Exporté le ${new Date().toLocaleDateString('fr-FR')}`, '═'.repeat(50), ''];
  sorted.forEach((e, i) => {
    if (i > 0) lines.push('', '─'.repeat(40), '');
    if (e.title) lines.push(`# ${e.title}`);
    lines.push(`Date : ${formatDateFull(e.createdAt)}`);
    lines.push('');
    lines.push(e.content || '');
  });
  const dateStr = new Date().toLocaleDateString('fr-FR', {year:'numeric', month:'2-digit', day:'2-digit'}).replace(/\//g,'-');
  downloadText(`journal_complet_${dateStr}.txt`, lines.join('\n'));
  showToast(`${sorted.length} notes exportées ✓`);
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}
