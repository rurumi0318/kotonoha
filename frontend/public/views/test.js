import { navigate } from '../utils.js';
import { state } from '../state.js';

export default async function renderTest(app, cid, did) {
  const deckName = state.deckName || 'Deck';
  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Words
        </button>
        <div class="header-title">${deckName}</div>
      </header>
      <main class="app-main">
        <div class="placeholder-page">
          <div class="icon">🎌</div>
          <h2>Test Mode</h2>
          <p>Test mode is coming soon.<br>Practice your vocabulary with FSRS-powered reviews.</p>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => {
    if (cid && did) navigate(`#/words/${cid}/${did}`);
    else navigate('#/collections');
  };
}
