import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/+esm';
import { api } from '../api.js';
import { state } from '../state.js';
import { navigate, showToast, showModal, closeModal, escapeHtml, stabilityIcon } from '../utils.js';

export default async function renderDecks(app, cid) {
  if (!cid) { navigate('#/collections'); return; }

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Collections
        </button>
        <div class="header-title" id="col-title"></div>
      </header>
      <main class="app-main">
        <div class="page-header">
          <h1 class="page-title">Decks</h1>
          <button class="btn-primary" id="new-btn">+ New</button>
        </div>
        <div id="list" class="card-list">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate('#/collections');
  document.getElementById('new-btn').onclick = () => openCreateModal(null);

  let decks = [];
  let collectionName = '';

  try {
    // Load collection name and decks in parallel
    const [collections, fetchedDecks] = await Promise.all([
      api.get('/collections'),
      api.get(`/collections/${cid}/decks`),
    ]);
    const col = collections.find(c => c.id === cid);
    collectionName = col?.name || '';
    state.collectionName = collectionName;
    document.getElementById('col-title').textContent = collectionName;
    decks = fetchedDecks;
    renderList(decks);
    loadAllDeckStats(decks);
  } catch (err) {
    document.getElementById('list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Failed to load decks</div>
      </div>`;
    showToast('Failed to load decks', 'error');
  }

  function renderList(ds) {
    const list = document.getElementById('list');
    if (!ds.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🗂️</div>
          <div class="empty-state-title">No decks yet</div>
          <div class="empty-state-desc">Add your first deck to this collection.</div>
        </div>`;
      return;
    }

    list.innerHTML = ds.map(d => `
      <div class="card" data-id="${d.id}">
        <span class="card-drag" title="Drag to reorder">⠿</span>
        <div class="card-body" data-id="${d.id}">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="card-name">${escapeHtml(d.name)}</span>
            ${d.tag ? `<span class="badge badge-tag">${escapeHtml(d.tag)}</span>` : ''}
          </div>
          <div class="card-meta">
            <span class="card-count">${d.word_order?.length ?? 0} word${(d.word_order?.length ?? 0) !== 1 ? 's' : ''}</span>
            <span class="familiarity-icon" data-deck-id="${d.id}">⋯</span>
            <div class="progress-bar" title="% in Review">
              <div class="progress-fill" data-deck-id="${d.id}" style="width:0%"></div>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-icon test-btn" data-id="${d.id}" title="Test this deck">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
          <button class="btn-icon edit-btn" data-id="${d.id}" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon delete-btn" data-id="${d.id}" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.card-body').forEach(el => {
      el.onclick = () => navigate(`#/words/${cid}/${el.dataset.id}`);
    });

    list.querySelectorAll('.test-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        navigate(`#/test/${cid}/${btn.dataset.id}`);
      };
    });

    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const deck = decks.find(d => d.id === btn.dataset.id);
        if (deck) openCreateModal(deck);
      };
    });

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const deck = decks.find(d => d.id === btn.dataset.id);
        if (deck) openDeleteModal(deck);
      };
    });

    Sortable.create(list, {
      handle: '.card-drag',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: async () => {
        const newOrder = [...list.querySelectorAll('.card')].map(el => el.dataset.id);
        decks = newOrder.map(id => decks.find(d => d.id === id)).filter(Boolean);
        try {
          await api.put(`/collections/${cid}/decks/order`, { order: newOrder });
        } catch {
          showToast('Failed to save order', 'error');
        }
      },
    });
  }

  async function loadAllDeckStats(ds) {
    await Promise.all(ds.map(d => loadDeckStats(d)));
  }

  async function loadDeckStats(deck) {
    if (!deck.word_order?.length) {
      updateDeckStats(deck.id, 0, null);
      return;
    }
    try {
      const words = await api.get(`/collections/${cid}/decks/${deck.id}/words`);
      const reviewCount = words.filter(w => w.fsrs_data?.state === 2).length;
      const progress = words.length ? (reviewCount / words.length) * 100 : 0;
      const stabilities = words.map(w => w.fsrs_data?.stability).filter(s => s != null);
      const avgStability = stabilities.length
        ? stabilities.reduce((a, b) => a + b, 0) / stabilities.length
        : null;
      updateDeckStats(deck.id, progress, avgStability);
    } catch {
      // Silently ignore stats load failures
    }
  }

  function updateDeckStats(deckId, progress, avgStability) {
    const fill = document.querySelector(`.progress-fill[data-deck-id="${deckId}"]`);
    if (fill) fill.style.width = `${progress.toFixed(1)}%`;
    const icon = document.querySelector(`.familiarity-icon[data-deck-id="${deckId}"]`);
    if (icon) icon.textContent = stabilityIcon(avgStability);
  }

  function openCreateModal(existing) {
    const isEdit = !!existing;
    showModal(`
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'Edit Deck' : 'New Deck'}</div>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="deck-name">Name</label>
          <input id="deck-name" class="form-input" type="text" placeholder="e.g. Animals"
            value="${isEdit ? escapeHtml(existing.name) : ''}" maxlength="80">
          <div class="form-error" id="deck-name-err" style="display:none"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="deck-tag">Tag <span class="text-secondary">(optional)</span></label>
          <input id="deck-tag" class="form-input" type="text" placeholder="e.g. N3, Grammar, Verbs"
            value="${isEdit ? escapeHtml(existing.tag || '') : ''}" maxlength="40">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-save">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    `);

    const nameInput = document.getElementById('deck-name');
    const nameErr   = document.getElementById('deck-name-err');
    const saveBtn   = document.getElementById('modal-save');
    nameInput.focus();
    nameInput.select();

    document.getElementById('modal-cancel').onclick = closeModal;

    saveBtn.onclick = async () => {
      const name = nameInput.value.trim();
      const tag  = document.getElementById('deck-tag').value.trim();

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
          await api.patch(`/collections/${cid}/decks/${existing.id}`, { name, tag });
          closeModal();
          showToast('Deck updated', 'success');
        } else {
          const result = await api.post(`/collections/${cid}/decks`, { name, tag });
          closeModal();
          showToast('Deck created', 'success');
          navigate(`#/words/${cid}/${result.id}`);
          return;
        }
        const fresh = await api.get(`/collections/${cid}/decks`);
        decks = fresh;
        renderList(fresh);
        loadAllDeckStats(fresh);
      } catch (err) {
        showToast(err.message || 'Failed to save', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save' : 'Create';
      }
    };

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
  }

  function openDeleteModal(deck) {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Delete deck?</div>
      </div>
      <div class="modal-body">
        <p>Delete "<strong>${escapeHtml(deck.name)}</strong>" and all its words? This cannot be undone.</p>
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
      try {
        await api.delete(`/collections/${cid}/decks/${deck.id}`);
        closeModal();
        showToast('Deck deleted', 'success');
        const fresh = await api.get(`/collections/${cid}/decks`);
        decks = fresh;
        renderList(fresh);
      } catch {
        showToast('Failed to delete', 'error');
        closeModal();
      }
    };
  }
}
