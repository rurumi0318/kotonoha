import { navigate, showToast } from '../utils.js';
import { signOut } from '../auth.js';
import { state } from '../state.js';
import { getPreferences, updatePreferences } from '../api.js';
import { getAudioEnabled, setAudioEnabled, getAutoPlay, setAutoPlay, getReviewAutoPlay, setReviewAutoPlay, VOICE_OPTIONS, getSelectedVoiceId, setSelectedVoiceId, audioService } from '../audio.js';

const THEMES = [
  { id: 'midnight', name: 'Midnight', bg: '#0f1117', surface: '#1a1d27', accent: '#6c6fff', text: '#eef0ff' },
  { id: 'amber',    name: 'Amber',    bg: '#110f0a', surface: '#1e1912', accent: '#e8924a', text: '#fdf4e7' },
  { id: 'ash',      name: 'Ash',      bg: '#2b2930', surface: '#37353e', accent: '#a87c7c', text: '#d3dad9' },
  { id: 'ocean',    name: 'Ocean',    bg: '#122637', surface: '#1b3c53', accent: '#5a8aaa', text: '#e3e3e3' },
  { id: 'ember',    name: 'Ember',    bg: '#1a262f', surface: '#25343f', accent: '#ff9b51', text: '#eaefef' },
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
  const prefs = state.preferences ?? await getPreferences().then(p => { state.preferences = p; return p; });
  const currentLang = prefs.main_language || '';
  const current = localStorage.getItem('theme') || 'midnight';
  const audioEnabled = getAudioEnabled();
  const autoPlay = getAutoPlay();
  const reviewAutoPlay = getReviewAutoPlay();
  const selectedVoiceId = getSelectedVoiceId();

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
        <button class="btn-back" id="back-btn" title="Back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="header-title">Settings</div>
      </header>
      <main class="app-main">
        <div class="word-section">
          <div class="word-section-title">Dictionary Language</div>
          <div class="lang-toggle">
            <button class="lang-toggle-btn ${currentLang === 'EN' ? 'active' : ''}" data-lang="EN">English</button>
            <button class="lang-toggle-btn ${currentLang === 'ZH-TW' ? 'active' : ''}" data-lang="ZH-TW">繁體中文</button>
          </div>
        </div>
        <div class="word-section" style="margin-top: 24px">
          <div class="word-section-title">Color Theme</div>
          <div class="theme-grid">${themeCards}</div>
        </div>
        <div class="word-section" style="margin-top: 24px">
          <div class="word-section-title">Audio</div>
          <div class="pause-toggle" id="audio-toggle" role="button" tabindex="0" aria-pressed="${audioEnabled}">
            <div>
              <div class="pause-toggle-label">Enable Audio</div>
              <div class="pause-toggle-sub">Tap words and sentences to hear them</div>
            </div>
            <div class="toggle-switch ${audioEnabled ? 'on' : ''}" id="audio-switch"></div>
          </div>
          <div class="pause-toggle" id="autoplay-toggle" role="button" tabindex="0" aria-pressed="${autoPlay}" style="margin-top:12px">
            <div>
              <div class="pause-toggle-label">Auto-play</div>
              <div class="pause-toggle-sub">Play word audio when opening a word</div>
            </div>
            <div class="toggle-switch ${autoPlay ? 'on' : ''}" id="autoplay-switch"></div>
          </div>
          <div class="pause-toggle" id="review-autoplay-toggle" role="button" tabindex="0" aria-pressed="${reviewAutoPlay}" style="margin-top:12px">
            <div>
              <div class="pause-toggle-label">Auto-play in Review</div>
              <div class="pause-toggle-sub">Play word audio when revealing a card</div>
            </div>
            <div class="toggle-switch ${reviewAutoPlay ? 'on' : ''}" id="review-autoplay-switch"></div>
          </div>
          <div style="margin-top:16px">
            <div class="pause-toggle-label" style="margin-bottom:8px">Voice</div>
            <div class="lang-toggle">
              ${VOICE_OPTIONS.map(v => `
                <button class="lang-toggle-btn ${v.id === selectedVoiceId ? 'active' : ''}" data-voice="${v.id}">${v.label}</button>
              `).join('')}
            </div>
          </div>
          <div style="margin-top:16px">
            <button class="btn-secondary" id="clear-audio-btn" style="width:100%">Clear Cached Audio</button>
          </div>
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

  document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const lang = btn.dataset.lang;
      if (lang === (state.preferences?.main_language)) return;
      try {
        const updated = await updatePreferences({ main_language: lang });
        state.preferences = updated;
        document.querySelectorAll('.lang-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showToast('Language updated');
      } catch {
        showToast('Failed to update language', 'error');
      }
    };
  });

  // Audio toggles
  function wireToggle(rowId, switchId, getter, setter) {
    const row = document.getElementById(rowId);
    const sw  = document.getElementById(switchId);
    const toggle = () => {
      const next = !getter();
      setter(next);
      sw.classList.toggle('on', next);
      row.setAttribute('aria-pressed', next);
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }
  wireToggle('audio-toggle',        'audio-switch',        getAudioEnabled,   setAudioEnabled);
  wireToggle('autoplay-toggle',     'autoplay-switch',     getAutoPlay,       setAutoPlay);
  wireToggle('review-autoplay-toggle', 'review-autoplay-switch', getReviewAutoPlay, setReviewAutoPlay);

  document.getElementById('clear-audio-btn').onclick = async () => {
    try {
      await audioService.clearAllAudio();
      showToast('Audio cache cleared');
    } catch {
      showToast('Failed to clear audio cache', 'error');
    }
  };

  document.querySelectorAll('[data-voice]').forEach(btn => {
    btn.onclick = () => {
      setSelectedVoiceId(btn.dataset.voice);
      document.querySelectorAll('[data-voice]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  document.querySelectorAll('.theme-card').forEach(card => {
    card.onclick = () => {
      const id = card.dataset.theme;
      applyTheme(id);
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    };
  });
}
