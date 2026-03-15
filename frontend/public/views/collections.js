import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/+esm';
import { api } from '../api.js';
import { state } from '../state.js';
import { navigate, showToast, showModal, closeModal, escapeHtml } from '../utils.js';
import { audioService } from '../audio.js';

export default async function renderCollections(app) {
  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <span class="app-logo" id="app-logo">言の葉</span>
        <div class="header-spacer"></div>
        <button class="btn-icon" id="settings-btn" title="Settings" aria-label="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </header>
      <main class="app-main">
        <div class="page-header">
          <h1 class="page-title">Collections</h1>
          <button class="btn-primary" id="new-btn">+ New</button>
        </div>
        <div id="list" class="card-list">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('app-logo').onclick = () => location.reload();
  document.getElementById('settings-btn').onclick = () => navigate('#/settings');
  document.getElementById('new-btn').onclick = () => openCreateModal(null);

  let collections = [];

  const cached = state.collectionsCache;
  if (cached !== null && cached !== undefined) {
    collections = cached;
    renderList(collections);
  } else {
    try {
      collections = await api.get('/collections');
      state.collectionsCache = collections;
      renderList(collections);
    } catch (err) {
      document.getElementById('list').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">Failed to load collections</div>
          <div class="empty-state-desc">Check your connection and try again.</div>
        </div>`;
      showToast('Failed to load collections', 'error');
    }
  }

  function renderList(cols) {
    const list = document.getElementById('list');
    if (!cols.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <div class="empty-state-title">No collections yet</div>
          <div class="empty-state-desc">Create your first collection to get started.</div>
        </div>`;
      return;
    }

    list.innerHTML = cols.map(c => `
      <div class="card" data-id="${c.id}">
        <span class="card-drag" title="Drag to reorder">⠿</span>
        <div class="card-body" data-id="${c.id}">
          <div class="card-name">${escapeHtml(c.name)}</div>
          ${c.desc ? `<div class="card-desc">${escapeHtml(c.desc)}</div>` : ''}
          <div class="card-meta">
            <span class="card-count">${c.deck_order?.length ?? 0} deck${(c.deck_order?.length ?? 0) !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-icon edit-btn" data-id="${c.id}" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon delete-btn" data-id="${c.id}" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Navigate on card body click
    list.querySelectorAll('.card-body').forEach(el => {
      el.onclick = () => navigate(`#/decks/${el.dataset.id}`);
    });

    // Edit
    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const col = cols.find(c => c.id === btn.dataset.id);
        if (col) openCreateModal(col);
      };
    });

    // Delete
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const col = cols.find(c => c.id === btn.dataset.id);
        if (col) openDeleteModal(col);
      };
    });

    // Sortable
    Sortable.create(list, {
      handle: '.card-drag',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: async () => {
        const newOrder = [...list.querySelectorAll('.card')].map(el => el.dataset.id);
        collections = newOrder.map(id => collections.find(c => c.id === id)).filter(Boolean);
        try {
          await api.put('/collections/order', { order: newOrder });
        } catch {
          showToast('Failed to save order', 'error');
        }
      },
    });
  }

  function openCreateModal(existing) {
    const isEdit = !!existing;
    showModal(`
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'Edit Collection' : 'New Collection'}</div>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="col-name">Name</label>
          <input id="col-name" class="form-input" type="text" placeholder="e.g. JLPT N3"
            value="${isEdit ? escapeHtml(existing.name) : ''}" maxlength="80" autocomplete="off">
          <div class="form-error" id="col-name-err" style="display:none"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="col-desc">Description <span class="text-secondary">(optional)</span></label>
          <textarea id="col-desc" class="form-textarea" placeholder="What is this collection for?"
            maxlength="300" autocomplete="off">${isEdit ? escapeHtml(existing.desc || '') : ''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-save">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    `);

    const nameInput = document.getElementById('col-name');
    const nameErr   = document.getElementById('col-name-err');
    const saveBtn   = document.getElementById('modal-save');
    nameInput.focus();
    nameInput.select();

    document.getElementById('modal-cancel').onclick = closeModal;

    nameInput.addEventListener('input', () => {
      nameErr.style.display = 'none';
    });

    saveBtn.onclick = async () => {
      const name = nameInput.value.trim();
      const desc = document.getElementById('col-desc').value.trim();

      if (!name) {
        nameErr.textContent = 'Name is required.';
        nameErr.style.display = 'block';
        nameInput.focus();
        return;
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-sm"></span>';
      nameErr.style.display = 'none';

      try {
        if (isEdit) {
          await api.patch(`/collections/${existing.id}`, { name, desc });
          closeModal();
          showToast('Collection updated', 'success');
          const cols = await api.get('/collections');
          state.collectionsCache = cols;
          collections = cols;
          renderList(cols);
        } else {
          const result = await api.post('/collections', { name, desc });
          state.collectionsCache = null;
          closeModal();
          showToast('Collection created', 'success');
          navigate(`#/decks/${result.id}`);
        }
      } catch (err) {
        if (err.isConflict) {
          nameErr.textContent = err.message;
          nameErr.style.display = 'block';
        } else {
          showToast('Failed to save', 'error');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save' : 'Create';
      }
    };

    // Submit on Enter in name field
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
  }

  function openDeleteModal(col) {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Delete collection?</div>
      </div>
      <div class="modal-body">
        <p>Delete "<strong>${escapeHtml(col.name)}</strong>" and all its decks and words? This cannot be undone.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-danger" id="modal-confirm">Delete</button>
      </div>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-confirm').onclick = async () => {
      const btn = document.getElementById('modal-confirm');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm"></span>';
      const overlay = document.getElementById('modal-overlay');
      if (overlay._bdHandler) {
        overlay.removeEventListener('mousedown', overlay._bdHandler);
        overlay.removeEventListener('touchstart', overlay._bdHandler);
      }
      if (overlay._escHandler) document.removeEventListener('keydown', overlay._escHandler);
      try {
        await api.delete(`/collections/${col.id}`);
        audioService.clearCollectionAudio(col.id);
        closeModal();
        showToast('Collection deleted', 'success');
        const cols = await api.get('/collections');
        state.collectionsCache = cols;
        collections = cols;
        renderList(cols);
      } catch {
        showToast('Failed to delete', 'error');
        closeModal();
      }
    };
  }
}
