'use strict';

const DB_KEY = 'journal_entries';
const PIN_KEY = 'journal_pin';
const LOCKED_KEY = 'journal_locked';

let state = {
  entries: [],
  currentId: null,
  pinBuffer: '',
  isSettingPin: false,
  pendingPin: '',
  searchQuery: '',
};

// ── STORAGE ──────────────────────────────────────────────────────────────────

function loadEntries() {
  try { state.entries = JSON.parse(localStorage.getItem(DB_KEY)) || []; }
  catch { state.entries = []; }
}

function saveEntries() {
  localStorage.setItem(DB_KEY, JSON.stringify(state.entries));
}

function getPin() { return localStorage.getItem(PIN_KEY); }
function setPin(p) { localStorage.setItem(PIN_KEY, p); }

// ── PIN / LOCK ────────────────────────────────────────────────────────────────

function showLock() {
  document.getElementById('lock-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
  state.pinBuffer = '';
  updateDots();
  const hasPin = !!getPin();
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

function handlePin(num) {
  if (state.pinBuffer.length >= 4) return;
  state.pinBuffer += num;
  updateDots();
  if (state.pinBuffer.length < 4) return;

  const stored = getPin();

  if (!stored) {
    // First time — set PIN
    if (!state.isSettingPin) {
      state.isSettingPin = true;
      state.pendingPin = state.pinBuffer;
      state.pinBuffer = '';
      document.getElementById('lock-subtitle').textContent = 'Confirmez votre code PIN';
      document.getElementById('first-time-hint').style.display = 'none';
      updateDots();
    } else {
      if (state.pinBuffer === state.pendingPin) {
        setPin(state.pinBuffer);
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
    // Verify PIN
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
  showEditView();
}

function newEntry() {
  state.currentId = null;
  document.getElementById('entry-title').value = '';
  document.getElementById('entry-content').value = '';
  document.getElementById('date-display').textContent = formatDateFull(new Date().toISOString());
  document.getElementById('btn-delete').style.display = 'none';
  showEditView();
  setTimeout(() => document.getElementById('entry-content').focus(), 100);
}

function saveEntry() {
  const title = document.getElementById('entry-title').value.trim();
  const content = document.getElementById('entry-content').value.trim();
  if (!title && !content) return showList();

  const now = new Date().toISOString();
  if (state.currentId) {
    const idx = state.entries.findIndex(e => e.id === state.currentId);
    if (idx >= 0) {
      state.entries[idx] = { ...state.entries[idx], title, content, updatedAt: now };
    }
  } else {
    state.entries.unshift({ id: Date.now().toString(), title, content, createdAt: now, updatedAt: now });
  }
  saveEntries();
  showList();
}

function deleteEntry() {
  if (!state.currentId) return;
  if (!confirm('Supprimer cette entrée ?')) return;
  state.entries = state.entries.filter(e => e.id !== state.currentId);
  saveEntries();
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

function init() {
  loadEntries();

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
