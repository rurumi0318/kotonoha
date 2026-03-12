import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/+esm';
import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText } from '../furigana.js';
import {
  navigate, showToast, showModal, closeModal, escapeHtml,
  fsrsStateBadge, formatDate, getFuriganaEnabled, setFuriganaEnabled,
} from '../utils.js';
import { openWordModal } from './wordModal.js';

export default async function renderWords(app, cid, did) {
  if (!cid || !did) { navigate('#/collections'); return; }

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Decks
        </button>
        <div class="header-title" id="deck-title"></div>
        <button class="btn-icon" id="furigana-btn" title="Toggle furigana">
          <span class="furigana-btn-icon">ふ</span>
        </button>
        <button class="btn-icon" id="test-btn" title="Test this deck">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
      </header>
      <main class="app-main">
        <div class="breadcrumb" id="breadcrumb"></div>
        <div class="page-header">
          <div>
            <h1 class="page-title">Words</h1>
            <div class="page-meta" id="word-count"></div>
          </div>
          <button class="btn-primary" id="new-btn">+ Add Word</button>
        </div>
        <div id="list" class="card-list">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate(`#/decks/${cid}`);
  document.getElementById('test-btn').onclick = () => navigate(`#/test/${cid}/${did}`);
  document.getElementById('furigana-btn').onclick = () => setFuriganaEnabled(!getFuriganaEnabled());
  document.getElementById('new-btn').onclick = () => openWordModal({
    mode: 'add',
    cid,
    did,
    onSaved: async () => {
      const fresh = await api.get(`/collections/${cid}/decks/${did}/words`);
      words = fresh;
      renderList(fresh);
    },
  });

  let words = [];

  try {
    // Load deck info and words in parallel
    const [decks, fetchedWords] = await Promise.all([
      api.get(`/collections/${cid}/decks`),
      api.get(`/collections/${cid}/decks/${did}/words`),
    ]);
    const deck = decks.find(d => d.id === did);
    const deckName = deck?.name || '';
    state.deckName = deckName;
    document.getElementById('deck-title').textContent = deckName;

    const colName = state.collectionName || '';
    if (colName) {
      document.getElementById('breadcrumb').textContent = `${colName} › ${deckName}`;
    }

    words = fetchedWords;
    renderList(words);
  } catch (err) {
    document.getElementById('list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Failed to load words</div>
      </div>`;
    showToast('Failed to load words', 'error');
  }

  function renderList(ws) {
    const list = document.getElementById('list');
    const countEl = document.getElementById('word-count');
    if (countEl) countEl.textContent = `${ws.length} word${ws.length !== 1 ? 's' : ''}`;

    if (!ws.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-title">No words yet</div>
          <div class="empty-state-desc">Add your first word to this deck.</div>
        </div>`;
      return;
    }

    list.innerHTML = ws.map(w => {
      const surface = renderFuriganaText(w.word);
      const furigana = renderFurigana(w.word);
      const due = w.fsrs_data?.due_date;
      const dueStr = formatDate(due);
      const isOverdue = due && new Date(due) <= new Date();
      return `
        <div class="word-item" data-id="${w.id}">
          <span class="card-drag" title="Drag to reorder">⠿</span>
          <div class="word-item-body" data-id="${w.id}">
            <div class="word-surface-with-hint">
              <span class="word-surface-sm" lang="ja">${furigana}</span>
              ${w.kana_hint ? `<span class="word-kana-hint" lang="ja">${escapeHtml(w.kana_hint)}</span>` : ''}
            </div>
            <div class="word-item-right">
              ${fsrsStateBadge(w.fsrs_data?.state)}
              <span class="due-label ${isOverdue ? 'overdue' : ''}">${escapeHtml(dueStr)}</span>
              ${w.is_paused ? '<span class="badge badge-tag">Paused</span>' : ''}
            </div>
          </div>
          <div class="card-actions">
            <button class="btn-icon delete-btn" data-id="${w.id}" data-surface="${escapeHtml(surface)}" title="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.word-item-body').forEach(el => {
      el.onclick = () => navigate(`#/word/${cid}/${did}/${el.dataset.id}`);
    });

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const word = words.find(w => w.id === btn.dataset.id);
        if (word) openDeleteModal(word);
      };
    });

    Sortable.create(list, {
      handle: '.card-drag',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: async () => {
        const newOrder = [...list.querySelectorAll('.word-item')].map(el => el.dataset.id);
        words = newOrder.map(id => words.find(w => w.id === id)).filter(Boolean);
        try {
          await api.put(`/collections/${cid}/decks/${did}/words/order`, { order: newOrder });
        } catch {
          showToast('Failed to save order', 'error');
        }
      },
    });
  }

  function openDeleteModal(word) {
    const surface = renderFuriganaText(word.word);
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Delete word?</div>
      </div>
      <div class="modal-body">
        <p>Delete "<strong lang="ja">${escapeHtml(surface)}</strong>"? This cannot be undone.</p>
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
        await api.delete(`/collections/${cid}/decks/${did}/words/${word.id}`);
        closeModal();
        showToast('Word deleted', 'success');
        words = words.filter(w => w.id !== word.id);
        renderList(words);
      } catch {
        showToast('Failed to delete', 'error');
        closeModal();
      }
    };
  }

}

