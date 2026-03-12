import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText } from '../furigana.js';
import {
  navigate, showToast, escapeHtml,
  fsrsStateLabel, formatDate, formatDateFull, round2,
  getFuriganaEnabled, setFuriganaEnabled,
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
        <div class="word-header-nav" id="word-header-title"></div>
        <button class="btn-icon" id="furigana-btn" title="Toggle furigana">
          <span class="furigana-btn-icon">ふ</span>
        </button>
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
  document.getElementById('furigana-btn').onclick = () => setFuriganaEnabled(!getFuriganaEnabled());

  let word = null;
  let wordsList = [];

  try {
    wordsList = await api.get(`/collections/${cid}/decks/${did}/words`);
    word = wordsList.find(w => w.id === wid);
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

  // ── Keyboard navigation (PC) ───────────────────────────────────────
  function handleKey(e) {
    if (!document.getElementById('modal-overlay')?.classList.contains('hidden')) return;
    if (e.target.matches('input, textarea, select')) return;
    const idx = wordsList.findIndex(w => w.id === wid);
    if (e.key === 'ArrowLeft'  && idx > 0)                  navigate(`#/word/${cid}/${did}/${wordsList[idx - 1].id}`);
    if (e.key === 'ArrowRight' && idx < wordsList.length - 1) navigate(`#/word/${cid}/${did}/${wordsList[idx + 1].id}`);
  }
  document.addEventListener('keydown', handleKey);
  window.addEventListener('hashchange', () => document.removeEventListener('keydown', handleKey), { once: true });

  // ── Swipe navigation (mobile) ──────────────────────────────────────
  function addSwipeNav(el) {
    let startX = 0;
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const delta = e.changedTouches[0].clientX - startX;
      if (Math.abs(delta) < 50) return;
      const idx = wordsList.findIndex(w => w.id === wid);
      if (delta > 0 && idx > 0)                    navigate(`#/word/${cid}/${did}/${wordsList[idx - 1].id}`);
      if (delta < 0 && idx < wordsList.length - 1) navigate(`#/word/${cid}/${did}/${wordsList[idx + 1].id}`);
    });
  }

  function renderWordDetail(w) {
    const idx      = wordsList.findIndex(ww => ww.id === w.id);
    const hasPrev  = idx > 0;
    const hasNext  = idx < wordsList.length - 1;
    const fsrs     = w.fsrs_data || {};
    const colName  = state.collectionName || '';
    const deckName = state.deckName || '';
    const breadcrumb = [colName, deckName].filter(Boolean).join(' › ');

    // Populate fixed header: breadcrumb text + nav controls
    document.getElementById('word-header-title').innerHTML = `
      <span class="word-header-breadcrumb">${escapeHtml(breadcrumb || renderFuriganaText(w.word))}</span>
      ${wordsList.length > 1 ? `
        <div class="word-header-nav-controls">
          <button class="btn-icon word-nav-btn" id="word-nav-prev" ${hasPrev ? '' : 'disabled'} title="Previous word (←)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="word-nav-count">${idx + 1} / ${wordsList.length}</span>
          <button class="btn-icon word-nav-btn" id="word-nav-next" ${hasNext ? '' : 'disabled'} title="Next word (→)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>` : ''}
    `;

    document.getElementById('word-content').innerHTML = `
      <div class="word-detail">
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

    // Prev / Next buttons
    if (hasPrev) document.getElementById('word-nav-prev').onclick = () => navigate(`#/word/${cid}/${did}/${wordsList[idx - 1].id}`);
    if (hasNext) document.getElementById('word-nav-next').onclick = () => navigate(`#/word/${cid}/${did}/${wordsList[idx + 1].id}`);

    // Swipe on the content area
    addSwipeNav(document.getElementById('word-content'));

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
        wordsList = await api.get(`/collections/${cid}/decks/${did}/words`);
        word = wordsList.find(fw => fw.id === wid);
        if (word) renderWordDetail(word);
      },
      onDeleted: () => navigate(`#/words/${cid}/${did}`),
    });
  }
}
