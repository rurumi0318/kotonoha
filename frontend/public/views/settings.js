import { navigate, showToast } from '../utils.js';
import { signOut } from '../auth.js';

const THEMES = [
  { id: 'midnight', name: 'Midnight', bg: '#0f1117', surface: '#1a1d27', accent: '#6c6fff', text: '#eef0ff' },
  { id: 'amber',    name: 'Amber',    bg: '#110f0a', surface: '#1e1912', accent: '#e8924a', text: '#fdf4e7' },
  { id: 'forest',   name: 'Forest',   bg: '#0a110d', surface: '#131e16', accent: '#4ade80', text: '#e8f5ec' },
  { id: 'mist',     name: 'Mist',     bg: '#f0f2f8', surface: '#ffffff', accent: '#5c5fef', text: '#1a1d30' },
];

function applyTheme(id) {
  if (id === 'midnight') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }
  localStorage.setItem('theme', id);
}

export default async function renderSettings(app) {
  const current = localStorage.getItem('theme') || 'midnight';

  const themeCards = THEMES.map(t => `
    <button class="theme-card ${t.id === current ? 'active' : ''}" data-theme="${t.id}">
      <div class="theme-preview" style="background:${t.bg}">
        <div style="flex:2; height:36px; background:${t.surface}; border-radius:6px;"></div>
        <div style="flex:1; height:36px; background:${t.accent}; border-radius:6px;"></div>
      </div>
      <div class="theme-name" style="background:${t.surface}; color:${t.text}">${t.name}</div>
    </button>
  `).join('');

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
        <div class="word-section">
          <div class="word-section-title">Color Theme</div>
          <div class="theme-grid">${themeCards}</div>
        </div>
        <div style="margin-top: 40px">
          <button class="btn-danger" id="signout-btn" style="width:100%">Sign Out</button>
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

  document.querySelectorAll('.theme-card').forEach(card => {
    card.onclick = () => {
      const id = card.dataset.theme;
      applyTheme(id);
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    };
  });
}
