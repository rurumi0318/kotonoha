import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText, segmentToKana } from '../furigana.js';
import { navigate, showToast, escapeHtml } from '../utils.js';
import { audioService } from '../audio.js';

function getReviewHint() {
  return localStorage.getItem('kotonoha_review_hint') === '1';
}

export default async function renderTest(app, cid, did) {
  if (!cid) { navigate('#/collections'); return; }

  // Parse ?decks=d1,d2,d3 from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const decksParam = params.get('decks') || '';

  const backTarget = did ? `#/words/${cid}/${did}` : `#/decks/${cid}`;
  const headerTitle = did
    ? (state.deckName || 'Review')
    : (state.collectionName || 'Review');

  document.body.classList.add('has-footer');

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn" title="Back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="header-title">${escapeHtml(headerTitle)}</div>
        <button class="btn-icon" id="hint-toggle-btn" title="Toggle reading hint">
          <span class="review-hint-btn-icon">ひ</span>
        </button>
        <div class="review-progress" id="progress"></div>
      </header>
      <main class="app-main review-main" id="review-main">
        <div class="loading-state"><div class="spinner"></div></div>
      </main>
      <footer class="app-footer" id="review-footer"></footer>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => {
    audioService.cancel();
    navigate(backTarget);
  };

  function updateHintBtn() {
    const on = getReviewHint();
    const icon = document.querySelector('.review-hint-btn-icon');
    if (icon) icon.classList.toggle('review-hint-off', !on);
  }

  document.getElementById('hint-toggle-btn').onclick = () => {
    const newVal = !getReviewHint();
    localStorage.setItem('kotonoha_review_hint', newVal ? '1' : '0');
    updateHintBtn();
    // Apply/remove class on front panel if currently showing front
    const panel = document.querySelector('.review-front-mode');
    if (panel) panel.classList.toggle('review-hint-off', !newVal);
  };

  updateHintBtn();

  // Clean up audio on navigation away
  window.addEventListener('hashchange', () => {
    audioService.cancel();
    document.onkeydown = null;
  }, { once: true });

  // Fetch due words
  let dueResponse;
  try {
    let url = '/review/due?';
    url += `collection_id=${encodeURIComponent(cid)}`;
    if (did) {
      url += `&deck_ids=${encodeURIComponent(did)}`;
    } else if (decksParam) {
      url += `&deck_ids=${encodeURIComponent(decksParam)}`;
    }
    dueResponse = await api.get(url);
  } catch (err) {
    renderError(err.message);
    return;
  }

  const words = dueResponse.words || [];
  const nextDue = dueResponse.next_due;
  const isEarly = dueResponse.is_early;

  // Session state — declared before empty check so renderEmpty can access them
  const queue = [...words];
  let totalUnique = words.length;
  let reviewed = 0;
  const stats = { again: 0, good: 0, easy: 0 };

  if (!words.length) {
    renderEmpty(nextDue, isEarly);
    return;
  }

  showCard();

  // ── Card front ──────────────────────────────────────────────────
  function showCard() {
    audioService.cancel();
    document.onkeydown = null;

    if (!queue.length) {
      renderSummary();
      return;
    }

    const word = queue[0];
    document.getElementById('progress').textContent = `${reviewed + 1} / ${totalUnique}`;

    // Front: word-hero layout (no definition visible)
    document.getElementById('review-main').innerHTML = `
      <div class="word-panel word-panel--overview review-front-mode${getReviewHint() ? '' : ' review-hint-off'}">
        <div class="word-hero" id="review-hero">
          <div class="word-surface-lg" lang="ja">${escapeHtml(renderFuriganaText(word.word))}</div>
          ${word.kana_hint ? `<div class="word-kana-hint-lg" lang="ja">${escapeHtml(word.kana_hint)}</div>` : ''}
        </div>
        <div class="word-primary">
          <div class="word-primary-empty" style="opacity:0.4">Press Reveal to see the answer</div>
        </div>
      </div>
    `;

    // Footer: Reveal button
    document.getElementById('review-footer').className = 'app-footer';
    document.getElementById('review-footer').innerHTML = `
      <button class="btn-primary app-footer-btn" id="reveal-btn">Reveal</button>
    `;

    // Word hero taps play audio (no flip)
    if (audioService.isAvailable()) {
      const heroEl = document.getElementById('review-hero');
      heroEl.addEventListener('click', () =>
        audioService.speak(word.kana_hint || segmentToKana(word.word), cid, heroEl)
      );
    }

    document.getElementById('reveal-btn').onclick = () => flipCard(word);

    // Space bar also reveals
    document.onkeydown = (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        flipCard(word);
      }
    };
  }

  // ── Card back ───────────────────────────────────────────────────
  function flipCard(word) {
    document.onkeydown = null;
    audioService.cancel();

    const firstDef = word.definitions?.[0] ?? null;
    const firstSentence = firstDef?.sentences?.[0] ?? null;

    document.getElementById('review-main').innerHTML = `
      <div class="word-panel word-panel--overview review-back-mode">
        <div class="word-hero" id="review-hero">
          <div class="word-surface-lg" lang="ja">${escapeHtml(renderFuriganaText(word.word))}</div>
          ${word.kana_hint ? `<div class="word-kana-hint-lg" lang="ja">${escapeHtml(word.kana_hint)}</div>` : ''}
        </div>
        <div class="word-primary" id="review-primary">
          ${firstDef ? `
            <div class="word-primary-def">${escapeHtml(firstDef.english_definition)}</div>
            ${firstSentence ? `
              <div class="word-primary-sentence"
                data-surface="${escapeHtml(firstSentence.surface)}">
                <div class="sentence-ja" lang="ja">${renderFurigana(firstSentence)}</div>
                ${firstSentence.en ? `<div class="sentence-en">${escapeHtml(firstSentence.en)}</div>` : ''}
              </div>
            ` : ''}
          ` : `<div class="word-primary-empty">No definitions yet.</div>`}
        </div>
      </div>
    `;

    // Footer: Again / Good / Easy
    document.getElementById('review-footer').className = 'app-footer app-footer--multi';
    document.getElementById('review-footer').innerHTML = `
      <button class="review-action-btn review-btn-again" data-rating="1">Again</button>
      <button class="review-action-btn review-btn-good"  data-rating="3">Good</button>
      <button class="review-action-btn review-btn-easy"  data-rating="4">Easy</button>
    `;

    // Audio: hero taps play word
    if (audioService.isAvailable()) {
      const heroEl = document.getElementById('review-hero');
      heroEl.addEventListener('click', () =>
        audioService.speak(word.kana_hint || segmentToKana(word.word), cid, heroEl)
      );

      if (firstSentence) {
        const primaryEl = document.getElementById('review-primary');
        if (primaryEl) {
          primaryEl.classList.add('audio-enabled');
          primaryEl.addEventListener('click', () =>
            audioService.speak(firstSentence.surface, cid, primaryEl)
          );
        }
      }
    }

    // Rating buttons
    document.querySelectorAll('.review-action-btn').forEach(btn => {
      btn.onclick = () => submitRating(word, parseInt(btn.dataset.rating));
    });

    // Keyboard shortcuts
    document.onkeydown = (e) => {
      if (e.key === '1') submitRating(word, 1);
      else if (e.key === '2' || e.key === '3') submitRating(word, 3);
      else if (e.key === '4') submitRating(word, 4);
    };
  }

  // ── Submit rating ───────────────────────────────────────────────
  async function submitRating(word, rating) {
    document.onkeydown = null;
    document.querySelectorAll('.review-action-btn').forEach(b => { b.disabled = true; });
    audioService.cancel();

    try {
      await api.post(
        `/review/collections/${word.collection_id}/decks/${word.deck_id}/words/${word.id}`,
        { rating }
      );
    } catch (err) {
      showToast('Failed to submit review', 'error');
      document.querySelectorAll('.review-action-btn').forEach(b => { b.disabled = false; });
      return;
    }

    if (rating === 1) stats.again++;
    else if (rating === 3) stats.good++;
    else if (rating === 4) stats.easy++;

    queue.shift();
    if (rating === 1) {
      queue.push(word);
    } else {
      reviewed++;
    }

    delete state.wordsCache[`${word.collection_id}/${word.deck_id}`];
    showCard();
  }

  // ── Session complete ────────────────────────────────────────────
  function renderSummary() {
    document.getElementById('progress').textContent = '';
    document.onkeydown = null;

    document.getElementById('review-main').innerHTML = `
      <div style="height:100%;overflow-y:auto;display:flex;align-items:center;justify-content:center;padding:20px 16px;">
        <div class="review-summary">
          <div class="review-summary-icon">🎉</div>
          <div class="review-summary-title">Session Complete</div>
          <div class="review-summary-stats">
            <div class="review-summary-stat">
              <span class="review-summary-stat-value">${totalUnique}</span>
              <span class="review-summary-stat-label">Reviewed</span>
            </div>
            <div class="review-summary-stat">
              <span class="review-summary-stat-value" style="color:var(--danger)">${stats.again}</span>
              <span class="review-summary-stat-label">Again</span>
            </div>
            <div class="review-summary-stat">
              <span class="review-summary-stat-value" style="color:var(--accent)">${stats.good}</span>
              <span class="review-summary-stat-label">Good</span>
            </div>
            <div class="review-summary-stat">
              <span class="review-summary-stat-value" style="color:var(--success)">${stats.easy}</span>
              <span class="review-summary-stat-label">Easy</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('review-footer').className = 'app-footer';
    document.getElementById('review-footer').innerHTML = `
      <button class="btn-primary app-footer-btn" id="done-btn">Done</button>
    `;
    document.getElementById('done-btn').onclick = () => navigate(backTarget);
  }

  // ── No cards due ────────────────────────────────────────────────
  function renderEmpty(nextDue, isEarly) {
    document.getElementById('progress').textContent = '';
    document.onkeydown = null;

    let countdownHtml = '';
    if (nextDue) {
      const diff = new Date(nextDue) - Date.now();
      if (diff > 0) {
        const h = Math.floor(diff / 3600000);
        const m = Math.ceil((diff % 3600000) / 60000);
        countdownHtml = `<div class="review-empty-sub">Next card due in ${h > 0 ? `${h}h ${m}m` : `${m}m`}</div>`;
      }
    }

    document.getElementById('review-main').innerHTML = `
      <div style="height:100%;overflow-y:auto;display:flex;align-items:center;justify-content:center;padding:20px 16px;">
        <div class="review-empty">
          <div class="review-empty-icon">✅</div>
          <div class="review-empty-title">No cards due</div>
          ${countdownHtml}
        </div>
      </div>
    `;

    if (!isEarly) {
      document.getElementById('review-footer').className = 'app-footer app-footer--multi';
      document.getElementById('review-footer').innerHTML = `
        <button class="btn-secondary app-footer-btn" id="early-btn">Review Early</button>
        <button class="btn-secondary app-footer-btn" id="empty-back-btn">Go Back</button>
      `;
      document.getElementById('early-btn').onclick = loadEarly;
    } else {
      document.getElementById('review-footer').className = 'app-footer';
      document.getElementById('review-footer').innerHTML = `
        <button class="btn-secondary app-footer-btn" id="empty-back-btn">Go Back</button>
      `;
    }
    document.getElementById('empty-back-btn').onclick = () => navigate(backTarget);
  }

  async function loadEarly() {
    const earlyBtn = document.getElementById('early-btn');
    if (earlyBtn) { earlyBtn.disabled = true; earlyBtn.innerHTML = '<span class="spinner-sm"></span>'; }
    try {
      let url = '/review/due?early=true';
      url += `&collection_id=${encodeURIComponent(cid)}`;
      if (did) url += `&deck_ids=${encodeURIComponent(did)}`;
      else if (decksParam) url += `&deck_ids=${encodeURIComponent(decksParam)}`;

      const earlyResponse = await api.get(url);
      const earlyWords = earlyResponse.words || [];
      if (!earlyWords.length) {
        showToast('No words available for early review', 'info');
        if (earlyBtn) { earlyBtn.disabled = false; earlyBtn.textContent = 'Review Early'; }
        return;
      }
      queue.length = 0;
      queue.push(...earlyWords);
      totalUnique = earlyWords.length;
      reviewed = 0;
      stats.again = 0; stats.good = 0; stats.easy = 0;
      showCard();
    } catch {
      showToast('Failed to load early review', 'error');
      if (earlyBtn) { earlyBtn.disabled = false; earlyBtn.textContent = 'Review Early'; }
    }
  }

  // ── Error state ─────────────────────────────────────────────────
  function renderError(msg) {
    document.getElementById('review-footer').className = 'app-footer';
    document.getElementById('review-footer').innerHTML = `
      <button class="btn-secondary app-footer-btn" id="empty-back-btn">Go Back</button>
    `;
    document.getElementById('review-main').innerHTML = `
      <div style="height:100%;display:flex;align-items:center;justify-content:center;padding:20px 16px;">
        <div class="review-empty">
          <div class="review-empty-icon">⚠️</div>
          <div class="review-empty-title">Failed to load review</div>
          <div class="review-empty-sub">${escapeHtml(msg)}</div>
        </div>
      </div>
    `;
    document.getElementById('empty-back-btn').onclick = () => navigate(backTarget);
  }
}
