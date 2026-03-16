import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/+esm';
import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText } from '../furigana.js';
import {
  navigate, showToast, showModal, closeModal, escapeHtml,
  masteryIcon, getFuriganaEnabled, setFuriganaEnabled,
} from '../utils.js';

export default async function renderWords(app, cid, did) {
  if (!cid || !did) { navigate('#/collections'); return; }
  const cacheKey = `${cid}/${did}`;

  document.body.classList.add('has-footer');

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn" title="Back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="header-title word-header-breadcrumb" id="deck-title"></div>
        <button class="btn-icon" id="furigana-btn" title="Toggle furigana">
          <span class="furigana-btn-icon">ふ</span>
        </button>
      </header>
      <main class="app-main">
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
      <footer class="app-footer">
        <button class="btn-primary app-footer-btn" id="review-btn">Review</button>
      </footer>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate(`#/decks/${cid}`);
  document.getElementById('furigana-btn').onclick = () => setFuriganaEnabled(!getFuriganaEnabled());
  document.getElementById('new-btn').onclick = () => navigate(`#/add-word/${cid}/${did}`);
  document.getElementById('review-btn').onclick = () => navigate(`#/test/${cid}/${did}`);

  let words = [];

  try {
    let fetchedDecks = state.decksCache[cid] ?? null;
    let fetchedWords = state.wordsCache[cacheKey] ?? null;

    const fetches = [];
    if (!fetchedDecks) fetches.push(api.get(`/collections/${cid}/decks`).then(r => { fetchedDecks = r; state.decksCache[cid] = r; }));
    if (!fetchedWords) fetches.push(api.get(`/collections/${cid}/decks/${did}/words`).then(r => { fetchedWords = r; state.wordsCache[cacheKey] = r; }));
    await Promise.all(fetches);

    const deck = fetchedDecks.find(d => d.id === did);
    const deckName = deck?.name || '';
    state.deckName = deckName;
    const colName = state.collectionName || '';
    document.getElementById('deck-title').textContent = deckName;

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
      return `
        <div class="word-item" data-id="${w.id}">
          <span class="card-drag" title="Drag to reorder">⠿</span>
          <div class="word-item-body" data-id="${w.id}">
            <div class="word-surface-with-hint">
              <span class="mastery-icon">${masteryIcon(w.fsrs_data)}</span>
              <span class="word-surface-sm" lang="ja">${furigana}</span>
              ${w.kana_hint ? `<span class="word-kana-hint" lang="ja">${escapeHtml(w.kana_hint)}</span>` : ''}
            </div>
            <div class="word-item-right">
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
        delete state.decksCache[cid];
        closeModal();
        showToast('Word deleted', 'success');
        words = words.filter(w => w.id !== word.id);
        state.wordsCache[cacheKey] = words;
        renderList(words);
      } catch {
        showToast('Failed to delete', 'error');
        closeModal();
      }
    };
  }

}

