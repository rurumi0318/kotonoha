import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana } from '../furigana.js';
import { navigate, showToast, escapeHtml } from '../utils.js';

export default async function renderTest(app, cid, did) {
  if (!cid) { navigate('#/collections'); return; }

  // Parse ?decks=d1,d2,d3 from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const decksParam = params.get('decks') || '';

  const backTarget = did
    ? `#/words/${cid}/${did}`
    : `#/decks/${cid}`;

  const headerTitle = did
    ? (state.deckName || 'Review')
    : (state.collectionName || 'Review');

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn" title="Back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="header-title">${escapeHtml(headerTitle)}</div>
        <div class="review-progress" id="progress"></div>
      </header>
      <main class="app-main" id="review-main" style="padding:0;">
        <div class="loading-state"><div class="spinner"></div></div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate(backTarget);

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
    document.getElementById('review-main').innerHTML = `
      <div class="review-empty">
        <div class="review-empty-icon">⚠️</div>
        <div class="review-empty-title">Failed to load review</div>
        <div class="review-empty-sub">${escapeHtml(err.message)}</div>
      </div>`;
    return;
  }

  const words = dueResponse.words || [];
  const nextDue = dueResponse.next_due;
  const isEarly = dueResponse.is_early;

  // Session state
  const queue = [...words];
  let totalUnique = words.length;
  let reviewed = 0;
  const stats = { again: 0, good: 0, easy: 0 };
  let currentFlipped = false;

  if (!words.length) {
    renderEmpty(nextDue, isEarly);
    return;
  }

  showCard();

  function showCard() {
    if (!queue.length) {
      renderSummary();
      return;
    }

    const word = queue[0];
    currentFlipped = false;

    document.getElementById('progress').textContent = `${reviewed + 1} / ${totalUnique}`;

    const main = document.getElementById('review-main');
    main.style.padding = '0';
    main.innerHTML = `
      <div class="review-container">
        <div class="review-card" id="card-area">
          <div class="review-front" id="card-front">
            <div class="review-front-word" lang="ja">${renderFurigana(word.word)}</div>
            ${word.kana_hint ? `<div class="review-front-hint" lang="ja">${escapeHtml(word.kana_hint)}</div>` : ''}
            <div class="review-tap-hint">Tap to reveal</div>
          </div>
        </div>
      </div>
    `;

    const cardArea = document.getElementById('card-area');
    cardArea.onclick = () => { if (!currentFlipped) flipCard(word); };

    document.onkeydown = (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!currentFlipped) flipCard(word);
      }
    };
  }

  function flipCard(word) {
    currentFlipped = true;

    const defsHtml = (word.definitions || []).map(def => {
      const sentencesHtml = (def.sentences || []).map(s => {
        const jaText = typeof s === 'string' ? escapeHtml(s) : (s.japanese ? renderFurigana(s.japanese) : renderFurigana(s));
        const enText = s.english ? escapeHtml(s.english) : '';
        return `
          <div style="padding:6px 0;">
            <div class="review-back-sentence-ja" lang="ja">${jaText}</div>
            ${enText ? `<div class="review-back-sentence-en">${enText}</div>` : ''}
          </div>`;
      }).join('');

      return `
        <div class="review-back-def">${escapeHtml(def.english_definition || '')}</div>
        ${sentencesHtml}`;
    }).join('');

    const notesHtml = word.user_notes
      ? `<div class="review-back-section"><div class="review-back-notes">${escapeHtml(word.user_notes)}</div></div>`
      : '';

    const scheduledDays = word.fsrs_data?.scheduled_days;
    const intervalLabel = formatInterval(scheduledDays);

    const main = document.getElementById('review-main');
    main.innerHTML = `
      <div class="review-container">
        <div class="review-card" id="card-area" style="cursor:default;">
          <div class="review-back">
            <div class="review-back-word" lang="ja">${renderFurigana(word.word)}</div>
            ${defsHtml}
            ${notesHtml}
            <div class="review-back-meta">${escapeHtml(word.deck_name || '')}</div>
          </div>
        </div>
        <div class="review-actions">
          <button class="review-action-btn review-btn-again" data-rating="1">
            Again
          </button>
          <button class="review-action-btn review-btn-good" data-rating="3">
            Good
          </button>
          <button class="review-action-btn review-btn-easy" data-rating="4">
            Easy
          </button>
        </div>
      </div>
    `;

    // Keyboard shortcuts for rating
    document.onkeydown = (e) => {
      if (e.key === '1') submitRating(word, 1);
      else if (e.key === '2' || e.key === '3') submitRating(word, 3);
      else if (e.key === '4') submitRating(word, 4);
    };

    main.querySelectorAll('.review-action-btn').forEach(btn => {
      btn.onclick = () => submitRating(word, parseInt(btn.dataset.rating));
    });
  }

  async function submitRating(word, rating) {
    const cid_ = word.collection_id;
    const did_ = word.deck_id;
    const wid_ = word.id;

    // Disable buttons immediately
    document.querySelectorAll('.review-action-btn').forEach(b => { b.disabled = true; });

    try {
      await api.post(`/review/collections/${cid_}/decks/${did_}/words/${wid_}`, { rating });
    } catch (err) {
      showToast('Failed to submit review', 'error');
      document.querySelectorAll('.review-action-btn').forEach(b => { b.disabled = false; });
      return;
    }

    // Track stats
    if (rating === 1) stats.again++;
    else if (rating === 3) stats.good++;
    else if (rating === 4) stats.easy++;

    // Remove from front of queue
    queue.shift();

    // Re-queue on Again
    if (rating === 1) {
      queue.push(word);
    } else {
      reviewed++;
    }

    // Invalidate caches for this deck
    delete state.wordsCache[`${cid_}/${did_}`];

    showCard();
  }

  function renderSummary() {
    document.getElementById('progress').textContent = '';
    document.onkeydown = null;

    const main = document.getElementById('review-main');
    main.style.padding = '';
    main.innerHTML = `
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
        <button class="btn-primary" id="done-btn" style="margin-top:16px;">Done</button>
      </div>
    `;

    document.getElementById('done-btn').onclick = () => navigate(backTarget);
  }

  function renderEmpty(nextDue, isEarly) {
    document.getElementById('progress').textContent = '';
    document.onkeydown = null;

    let countdownHtml = '';
    if (nextDue) {
      const diff = new Date(nextDue) - Date.now();
      if (diff > 0) {
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.ceil((diff % 3600000) / 60000);
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        countdownHtml = `<div class="review-empty-sub">Next card due in ${timeStr}</div>`;
      }
    }

    const main = document.getElementById('review-main');
    main.style.padding = '';
    main.innerHTML = `
      <div class="review-empty">
        <div class="review-empty-icon">✅</div>
        <div class="review-empty-title">No cards due</div>
        ${countdownHtml}
        ${!isEarly ? '<button class="btn-secondary" id="early-btn" style="margin-top:8px;">Review Early</button>' : ''}
        <button class="btn-ghost" id="empty-back-btn">Go Back</button>
      </div>
    `;

    document.getElementById('empty-back-btn').onclick = () => navigate(backTarget);

    const earlyBtn = document.getElementById('early-btn');
    if (earlyBtn) {
      earlyBtn.onclick = async () => {
        earlyBtn.disabled = true;
        earlyBtn.innerHTML = '<span class="spinner-sm"></span>';
        try {
          let url = '/review/due?early=true';
          url += `&collection_id=${encodeURIComponent(cid)}`;
          if (did) {
            url += `&deck_ids=${encodeURIComponent(did)}`;
          } else if (decksParam) {
            url += `&deck_ids=${encodeURIComponent(decksParam)}`;
          }
          const earlyResponse = await api.get(url);
          const earlyWords = earlyResponse.words || [];
          if (!earlyWords.length) {
            showToast('No words available for early review', 'info');
            earlyBtn.disabled = false;
            earlyBtn.textContent = 'Review Early';
            return;
          }
          // Restart session with early words
          queue.length = 0;
          queue.push(...earlyWords);
          totalUnique = earlyWords.length;
          reviewed = 0;
          stats.again = 0;
          stats.good = 0;
          stats.easy = 0;
          showCard();
        } catch (err) {
          showToast('Failed to load early review', 'error');
          earlyBtn.disabled = false;
          earlyBtn.textContent = 'Review Early';
        }
      };
    }
  }
}

function formatInterval(days) {
  if (!days || days < 1) return '<1d';
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
