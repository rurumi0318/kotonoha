import { navigate, showToast } from '../utils.js';
import { signOut } from '../auth.js';

export default async function renderSettings(app) {
  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div class="header-title">Settings</div>
      </header>
      <main class="app-main">
        <div class="placeholder-page">
          <div class="icon">⚙️</div>
          <h2>Settings</h2>
          <p>Settings coming soon.</p>
          <button class="btn-secondary" id="signout-btn" style="margin-top:24px">Sign Out</button>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate('#/collections');
  document.getElementById('signout-btn').onclick = async () => {
    try {
      await signOut();
      navigate('#/login');
    } catch {
      showToast('Failed to sign out', 'error');
    }
  };
}
