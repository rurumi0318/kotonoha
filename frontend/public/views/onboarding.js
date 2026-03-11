import { state } from '../state.js';
import { updatePreferences } from '../api.js';
import { navigate, showToast } from '../utils.js';

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

export default async function renderOnboarding(app) {
  const currentTheme = localStorage.getItem('theme') || 'midnight';

  const themeCards = THEMES.map(t => `
    <button class="theme-card ${t.id === currentTheme ? 'active' : ''}" data-theme="${t.id}">
      <div class="theme-preview" style="background:${t.bg}">
        <div style="flex:2; height:36px; background:${t.surface}; border-radius:6px;"></div>
        <div style="flex:1; height:36px; background:${t.accent}; border-radius:6px;"></div>
      </div>
      <div class="theme-name" style="background:${t.surface}; color:${t.text}">${t.name}</div>
    </button>
  `).join('');

  app.innerHTML = `
    <div class="onboarding-layout">
      <div class="onboarding-card">
        <div class="onboarding-brand">言葉の葉</div>
        <h1 class="onboarding-title">Welcome to Kotonoha</h1>

        <div class="onboarding-section-label">Dictionary Language</div>
        <div class="onboarding-options">
          <button class="lang-option" data-lang="EN">English</button>
          <button class="lang-option" data-lang="ZH-TW">繁體中文</button>
        </div>

        <div class="onboarding-section-label" style="margin-top: 28px">Color Theme</div>
        <div class="theme-grid">${themeCards}</div>

        <button class="btn-primary onboarding-confirm" id="confirm-btn" disabled>Get Started</button>
      </div>
    </div>
  `;

  let selectedLang = null;

  document.querySelectorAll('.lang-option').forEach(btn => {
    btn.onclick = () => {
      selectedLang = btn.dataset.lang;
      document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('confirm-btn').disabled = false;
    };
  });

  document.querySelectorAll('.theme-card').forEach(card => {
    card.onclick = () => {
      applyTheme(card.dataset.theme);
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    };
  });

  document.getElementById('confirm-btn').onclick = async () => {
    if (!selectedLang) return;
    try {
      const prefs = await updatePreferences({ main_language: selectedLang });
      state.preferences = prefs;
      navigate('#/collections');
    } catch {
      showToast('Failed to save preference', 'error');
    }
  };
}
