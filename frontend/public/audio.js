// ── Audio settings (localStorage) ─────────────────────────────────

export function getAudioEnabled() {
  return localStorage.getItem('audio-enabled') !== 'false';
}
export function setAudioEnabled(val) {
  localStorage.setItem('audio-enabled', String(val));
}
export function getAutoPlay() {
  return localStorage.getItem('audio-autoplay') === 'true';
}
export function setAutoPlay(val) {
  localStorage.setItem('audio-autoplay', String(val));
}

// ── Provider interface ─────────────────────────────────────────────
// All providers implement:
//   isAvailable()                        → bool
//   speak(text, collectionId)            → Promise<void>
//   cancel()                             → void
//   clearCollectionAudio(collectionId)   → Promise<void>
//   getAudioCacheStats()                 → Promise<Array>

// ── Phase 1: Web Speech API ───────────────────────────────────────
class WebSpeechProvider {
  constructor() {
    this._synth = window.speechSynthesis;
  }

  isAvailable() {
    return 'speechSynthesis' in window;
  }

  speak(text) {
    return new Promise((resolve, reject) => {
      this.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ja-JP';
      utter.onend = resolve;
      utter.onerror = reject;

      const doSpeak = () => {
        const jaVoice = this._synth.getVoices().find(v => v.lang.startsWith('ja'));
        if (jaVoice) utter.voice = jaVoice;
        this._synth.speak(utter);
      };

      // Voices may not be loaded on first call — wait for voiceschanged if needed
      if (this._synth.getVoices().length > 0) {
        doSpeak();
      } else {
        this._synth.addEventListener('voiceschanged', doSpeak, { once: true });
      }
    });
  }

  cancel() {
    this._synth.cancel();
  }

  async clearCollectionAudio(_collectionId) {}
  async getAudioCacheStats() { return []; }
}

// ── Phase 2: Backend TTS + IndexedDB cache (not yet active) ──────
// Activated when window.AUDIO_PROVIDER === 'cloud_tts'.
// Will call GET /tts/audio?text=... → redirect to signed GCS URL → blob cached in
// IndexedDB, keyed by { collectionId, sha256(voiceName + normalizedText) }.
class BackendTTSProvider {
  isAvailable() { return false; }
  async speak(_text, _collectionId) {}
  cancel() {}
  async clearCollectionAudio(_collectionId) {}
  async getAudioCacheStats() { return []; }
}

// ── AudioService singleton ────────────────────────────────────────
class AudioService {
  constructor() {
    const providerKey = window.AUDIO_PROVIDER || 'web_speech';
    this._provider = providerKey === 'cloud_tts'
      ? new BackendTTSProvider()
      : new WebSpeechProvider();
    this._activeEl   = null;
    this._activeText = null;
  }

  isAvailable() {
    return getAudioEnabled() && this._provider.isAvailable();
  }

  // el: optional DOM element that receives the 'audio-playing' CSS class during playback.
  // Tapping the same element again cancels playback (toggle).
  async speak(text, collectionId, el = null) {
    if (!this.isAvailable() || !text) return;

    if (this._activeText === text && this._activeEl === el) {
      this.cancel();
      return;
    }

    this.cancel();

    this._activeText = text;
    this._activeEl   = el;
    el?.classList.add('audio-playing');

    try {
      await this._provider.speak(text, collectionId);
    } catch {
      // Swallow — browser may cancel utterances on navigation
    } finally {
      if (this._activeEl === el) {
        el?.classList.remove('audio-playing');
        this._activeText = null;
        this._activeEl   = null;
      }
    }
  }

  cancel() {
    this._provider.cancel();
    this._activeEl?.classList.remove('audio-playing');
    this._activeText = null;
    this._activeEl   = null;
  }

  async clearCollectionAudio(collectionId) {
    return this._provider.clearCollectionAudio(collectionId);
  }

  async getAudioCacheStats() {
    return this._provider.getAudioCacheStats();
  }
}

export const audioService = new AudioService();
