import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText, segmentToKana } from '../furigana.js';
import {
  navigate, showToast, escapeHtml,
  fsrsStateLabel, formatDate, formatDateFull, round2,
} from '../utils.js';
import { audioService, getAutoPlay } from '../audio.js';

export default async function renderWord(app, cid, did, wid) {
  if (!cid || !did || !wid) { navigate('#/collections'); return; }

  const cacheKey = `${cid}/${did}`;

  // ── Same-deck partial update (skip full DOM replacement) ───────────
  const existingLayout = app.querySelector('.view-layout[data-word-cid]');
  const isSameDeck = existingLayout?.dataset.wordCid === cid && existingLayout?.dataset.wordDid === did;

  // Word detail always has a footer; route() removes it on navigation away
  document.body.classList.add('has-footer');

  if (!isSameDeck) {
    app.innerHTML = `
      <div class="view-layout" data-word-cid="${cid}" data-word-did="${did}">
        <header class="app-header">
          <button class="btn-back" id="back-btn" title="Back" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="word-header-nav" id="word-header-title"></div>
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
        <footer class="app-footer">
          <button class="btn-secondary app-footer-btn" id="details-btn" title="Show details">Details</button>
        </footer>
      </div>
    `;

    document.getElementById('back-btn').onclick = () => navigate(`#/words/${cid}/${did}`);
    document.getElementById('details-btn').onclick = () => {
      const panels = document.getElementById('word-panels');
      const btn = document.getElementById('details-btn');
      if (!panels) return;
      const entering = panels.classList.toggle('details-active');
      btn.textContent = entering ? 'Overview' : 'Details';
      if (entering) document.getElementById('word-panel-details').scrollTop = 0;
      else          document.getElementById('word-panel-overview').scrollTop = 0;
    };

    // ── Swipe navigation (mobile) — set up once per deck view ─────────
    const contentEl = document.getElementById('word-content');
    let swipeStartX = 0;
    contentEl.addEventListener('touchstart', (e) => { swipeStartX = e.touches[0].clientX; }, { passive: true });
    contentEl.addEventListener('touchend', (e) => {
      if (document.getElementById('word-panels')?.classList.contains('details-active')) return;
      const delta = e.changedTouches[0].clientX - swipeStartX;
      if (Math.abs(delta) < 50) return;
      const currentWid = contentEl.dataset.currentWid;
      const list = state.wordsCache[cacheKey] || [];
      const idx = list.findIndex(w => w.id === currentWid);
      if (delta > 0 && idx > 0)              navigate(`#/word/${cid}/${did}/${list[idx - 1].id}`);
      if (delta < 0 && idx < list.length - 1) navigate(`#/word/${cid}/${did}/${list[idx + 1].id}`);
    });
  }

  let word = null;
  let wordsList = state.wordsCache[cacheKey] ?? null;

  try {
    if (wordsList === null) {
      wordsList = await api.get(`/collections/${cid}/decks/${did}/words`);
      state.wordsCache[cacheKey] = wordsList;
    }
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
    if (e.key === ' ' && word) {
      e.preventDefault();
      // audioService.speak(word.kana_hint || segmentToKana(word.word), cid, document.querySelector('.word-hero'));
      audioService.speak(word.word.surface, cid, document.querySelector('.word-hero'));
    }
  }
  document.addEventListener('keydown', handleKey);
  window.addEventListener('hashchange', () => {
    document.removeEventListener('keydown', handleKey);
    audioService.cancel();
  }, { once: true });

  function renderWordDetail(w) {
    app.querySelector('.app-main').scrollTop = 0;
    // Reset panel state when navigating to a new word
    document.getElementById('word-panels')?.classList.remove('details-active');
    const detailsBtn = document.getElementById('details-btn');
    if (detailsBtn) detailsBtn.textContent = 'Details';

    const idx      = wordsList.findIndex(ww => ww.id === w.id);
    const hasPrev  = idx > 0;
    const hasNext  = idx < wordsList.length - 1;
    const fsrs     = w.fsrs_data || {};
    const deckName = state.deckName || '';

    const dotClass = fsrs.state === 2 ? 'review'
                   : fsrs.state === 3 ? 'relearning'
                   : fsrs.state === 1 ? 'learning'
                   : 'new';
    const firstDef      = w.definitions?.[0] ?? null;
    const firstSentence = firstDef?.sentences?.[0] ?? null;

    // Populate fixed header: breadcrumb text + nav controls
    document.getElementById('word-header-title').innerHTML = `
      <span class="word-header-breadcrumb">${escapeHtml(deckName || renderFuriganaText(w.word))}</span>
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
      <div class="word-panels" id="word-panels">

        <!-- Overview panel -->
        <div class="word-panel word-panel--overview" id="word-panel-overview">
          <div class="word-hero">
            <div class="word-surface-lg" lang="ja">${escapeHtml(renderFuriganaText(w.word))}</div>
            ${w.kana_hint ? `<div class="word-kana-hint-lg" lang="ja">${escapeHtml(w.kana_hint)}</div>` : ''}
            <div class="word-state-dot word-state-dot--${dotClass}"></div>
          </div>
          <div class="word-primary">
            ${firstDef ? `
              <div class="word-primary-def">${escapeHtml(firstDef.english_definition)}</div>
              ${firstSentence ? `
                <div class="word-primary-sentence" data-surface="${escapeHtml(firstSentence.surface)}">
                  <div class="sentence-ja" lang="ja">${renderFurigana(firstSentence)}</div>
                  ${firstSentence.en ? `<div class="sentence-en">${escapeHtml(firstSentence.en)}</div>` : ''}
                </div>
              ` : ''}
            ` : `<div class="word-primary-empty">No definitions yet.</div>`}
          </div>
        </div>

        <!-- Details panel -->
        <div class="word-panel word-panel--details" id="word-panel-details">
          <div class="word-section" style="margin-top:0">
            <div class="word-section-title">Definitions</div>
            ${(w.definitions || []).map((def, i) => `
              <div class="definition-card">
                <div class="definition-english">${i + 1}. ${escapeHtml(def.english_definition)}</div>
                ${(def.sentences || []).map(s => `
                  <div class="sentence-item" data-surface="${escapeHtml(s.surface)}">
                    <div class="sentence-ja" lang="ja">${renderFurigana(s)}</div>
                    ${s.en ? `<div class="sentence-en">${escapeHtml(s.en)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            `).join('')}
            ${!w.definitions?.length ? '<p class="text-secondary text-sm">No definitions yet.</p>' : ''}
          </div>

          <div class="word-section">
            <div class="word-section-title">Notes</div>
            <div class="notes-text">${escapeHtml(w.user_notes || '') || '<span class="text-secondary">—</span>'}</div>
          </div>

          <div class="word-section">
            <div class="word-section-title">Progress</div>
            <div class="fsrs-grid">
              <div class="fsrs-cell">
                <div class="fsrs-cell-label">State</div>
                <div class="fsrs-cell-value">${escapeHtml(fsrsStateLabel(fsrs.state))}</div>
              </div>
              <div class="fsrs-cell">
                <div class="fsrs-cell-label">Due</div>
                <div class="fsrs-cell-value">${formatDate(fsrs.due)}</div>
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

      </div>
    `;

    // Mark current word for swipe handler
    document.getElementById('word-content').dataset.currentWid = w.id;

    // Prev / Next buttons
    if (hasPrev) document.getElementById('word-nav-prev').onclick = () => navigate(`#/word/${cid}/${did}/${wordsList[idx - 1].id}`);
    if (hasNext) document.getElementById('word-nav-next').onclick = () => navigate(`#/word/${cid}/${did}/${wordsList[idx + 1].id}`);

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
    document.getElementById('edit-btn').onclick = () => navigate(`#/edit-word/${cid}/${did}/${w.id}`);

    // ── Audio ──────────────────────────────────────────────────────
    if (audioService.isAvailable()) {
      const heroEl = document.querySelector('.word-hero');
      // heroEl?.addEventListener('click', () => audioService.speak(w.kana_hint || segmentToKana(w.word), cid, heroEl));
      heroEl?.addEventListener('click', () => audioService.speak(w.word.surface, cid, heroEl));

      if (firstSentence) {
        const primaryEl = document.querySelector('.word-primary');
        primaryEl?.classList.add('audio-enabled');
        primaryEl?.addEventListener('click', () => audioService.speak(firstSentence.surface, cid, primaryEl));
      }

      document.querySelectorAll('.sentence-item').forEach(el => {
        el.addEventListener('click', () => {
          const surface = el.dataset.surface;
          if (surface) audioService.speak(surface, cid, el);
        });
      });

      // if (getAutoPlay()) audioService.speak(w.kana_hint || segmentToKana(w.word), cid, heroEl);
      if (getAutoPlay()) audioService.speak(w.word.surface, cid, heroEl);
    }
  }
}
