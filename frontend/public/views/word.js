import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText } from '../furigana.js';
import {
  navigate, showToast, escapeHtml,
  fsrsStateLabel, formatDate, formatDateFull, round2,
} from '../utils.js';
import { openWordModal } from './wordModal.js';

export default async function renderWord(app, cid, did, wid) {
  if (!cid || !did || !wid) { navigate('#/collections'); return; }

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Words
        </button>
        <div class="header-title" id="word-header-title"></div>
        <button class="btn-icon" id="edit-btn" title="Edit word">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </header>
      <main class="app-main">
        <div id="word-content">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate(`#/words/${cid}/${did}`);

  let word = null;

  try {
    const words = await api.get(`/collections/${cid}/decks/${did}/words`);
    word = words.find(w => w.id === wid);
    if (!word) throw new Error('Word not found');
    renderWordDetail(word);
  } catch (err) {
    document.getElementById('word-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Word not found</div>
      </div>`;
    showToast('Failed to load word', 'error');
  }

  function renderWordDetail(w) {
    const surface = renderFuriganaText(w.word);
    document.getElementById('word-header-title').textContent = surface;

    const fsrs = w.fsrs_data || {};
    const colName  = state.collectionName || '';
    const deckName = state.deckName || '';
    const breadcrumb = [colName, deckName].filter(Boolean).join(' › ');

    document.getElementById('word-content').innerHTML = `
      <div class="word-detail">
        ${breadcrumb ? `<div class="breadcrumb">${escapeHtml(breadcrumb)}</div>` : ''}

        <div class="word-surface-lg" lang="ja">${renderFurigana(w.word)}</div>
        ${w.kana_hint ? `<div class="word-kana-hint-lg" lang="ja">${escapeHtml(w.kana_hint)}</div>` : ''}

        <!-- Definitions -->
        <div class="word-section">
          <div class="word-section-title">Definitions</div>
          ${(w.definitions || []).map((def, i) => `
            <div class="definition-card">
              <div class="definition-english">${i + 1}. ${escapeHtml(def.english_definition)}</div>
              ${(def.sentences || []).map(s => `
                <div class="sentence-item">
                  <div class="sentence-ja" lang="ja">${renderFurigana(s)}</div>
                  ${s.en ? `<div class="sentence-en">${escapeHtml(s.en)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          `).join('')}
          ${!w.definitions?.length ? '<p class="text-secondary text-sm">No definitions yet.</p>' : ''}
        </div>

        <!-- Notes -->
        <div class="word-section">
          <div class="word-section-title">Notes</div>
          <div class="notes-text">${escapeHtml(w.user_notes || '') || '<span class="text-secondary">—</span>'}</div>
        </div>

        <!-- FSRS -->
        <div class="word-section">
          <div class="word-section-title">Progress</div>
          <div class="fsrs-grid">
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">State</div>
              <div class="fsrs-cell-value">${escapeHtml(fsrsStateLabel(fsrs.state))}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Due</div>
              <div class="fsrs-cell-value">${formatDate(fsrs.due_date)}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Last Review</div>
              <div class="fsrs-cell-value">${formatDateFull(fsrs.last_review)}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Stability</div>
              <div class="fsrs-cell-value">${fsrs.stability != null ? round2(fsrs.stability) + 'd' : '—'}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Difficulty</div>
              <div class="fsrs-cell-value">${fsrs.difficulty != null ? round2(fsrs.difficulty) : '—'}</div>
            </div>
          </div>
        </div>

        <!-- Pause toggle -->
        <div class="word-section">
          <div class="word-section-title">Status</div>
          <div class="pause-toggle" id="pause-toggle" role="button" tabindex="0" aria-pressed="${w.is_paused}">
            <div>
              <div class="pause-toggle-label">Paused</div>
              <div class="pause-toggle-sub">Paused words are excluded from reviews.</div>
            </div>
            <div class="toggle-switch ${w.is_paused ? 'on' : ''}" id="pause-switch"></div>
          </div>
        </div>
      </div>
    `;

    // Pause toggle
    const toggle = document.getElementById('pause-toggle');
    toggle.addEventListener('click', async () => {
      const sw = document.getElementById('pause-switch');
      const newPaused = !w.is_paused;
      w.is_paused = newPaused;
      sw.classList.toggle('on', newPaused);
      toggle.setAttribute('aria-pressed', newPaused);
      try {
        await api.patch(`/collections/${cid}/decks/${did}/words/${wid}`, { is_paused: newPaused });
        showToast(newPaused ? 'Word paused' : 'Word unpaused', 'success');
      } catch {
        w.is_paused = !newPaused;
        sw.classList.toggle('on', !newPaused);
        showToast('Failed to update', 'error');
      }
    });
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    });

    // Edit button
    document.getElementById('edit-btn').onclick = () => openWordModal({
      mode: 'edit',
      existing: w,
      cid,
      did,
      onSaved: async () => {
        const fresh = await api.get(`/collections/${cid}/decks/${did}/words`);
        word = fresh.find(fw => fw.id === wid);
        if (word) renderWordDetail(word);
      },
    });
  }
}
