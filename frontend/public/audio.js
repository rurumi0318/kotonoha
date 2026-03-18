// ── Voice options ─────────────────────────────────────────────────
// Single source of truth for all available voices.
// `provider` maps to a provider key in AudioService._providers.
// `voiceName` is passed to the provider (null = provider handles it internally).

export const VOICE_OPTIONS = [
  { id: 'leda',       label: 'Leda',       provider: 'cloud_tts',  voiceName: 'ja-JP-Chirp3-HD-Leda' },
  { id: 'web_speech', label: 'Web Speech', provider: 'web_speech', voiceName: null },
];

const DEFAULT_VOICE_ID = 'leda';

export function getSelectedVoiceId() {
  const stored = localStorage.getItem('audio-voice');
  return VOICE_OPTIONS.some(v => v.id === stored) ? stored : DEFAULT_VOICE_ID;
}
export function setSelectedVoiceId(id) {
  localStorage.setItem('audio-voice', id);
}

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
export function getReviewAutoPlay() {
  return localStorage.getItem('audio-review-autoplay') !== 'false';
}
export function setReviewAutoPlay(val) {
  localStorage.setItem('audio-review-autoplay', String(val));
}

// ── Provider interface ─────────────────────────────────────────────
// All providers implement:
//   isAvailable()                                  → bool
//   speak(text, collectionId, voiceName)           → Promise<void>
//   cancel()                                       → void
//   clearCollectionAudio(collectionId)             → Promise<void>
//   getAudioCacheStats()                           → Promise<Array>

// ── Web Speech provider ────────────────────────────────────────────
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

      if (this._synth.getVoices().length > 0) {
        doSpeak();
      } else {
        this._synth.addEventListener('voiceschanged', doSpeak, { once: true });
      }
    });
  }

  cancel() { this._synth.cancel(); }
  async clearCollectionAudio(_collectionId) {}
  async getAudioCacheStats() { return []; }
}

// ── Backend TTS provider (Cloud TTS + IndexedDB cache) ────────────
class BackendTTSProvider {
  constructor() {
    this._db    = null;
    this._audio = null;
  }

  isAvailable() { return true; }

  // ── IndexedDB (v2: keyPath includes voiceName) ───────────────────

  _openDb() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('kotonoha-audio', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Drop v1 store — keyPath changed to include voiceName
        if (db.objectStoreNames.contains('clips')) db.deleteObjectStore('clips');
        const store = db.createObjectStore('clips', {
          keyPath: ['collectionId', 'voiceName', 'textKey'],
        });
        store.createIndex('by_collection', 'collectionId');
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror   = ()  => reject(req.error);
    });
  }

  _normalizeText(text) {
    return text.normalize('NFKC').trim().replace(/\s+/g, ' ');
  }

  async _getCached(collectionId, voiceName, text) {
    const db  = await this._openDb();
    const key = [collectionId, voiceName, this._normalizeText(text)];
    return new Promise((resolve, reject) => {
      const req = db.transaction('clips', 'readonly').objectStore('clips').get(key);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror   = () => reject(req.error);
    });
  }

  async _putCached(collectionId, voiceName, text, blob) {
    const db = await this._openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite');
      tx.objectStore('clips').put({
        collectionId,
        voiceName,
        textKey:  this._normalizeText(text),
        blob,
        cachedAt: Date.now(),
      });
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  // ── Playback ─────────────────────────────────────────────────────

  async speak(text, collectionId, voiceName) {
    let blob = await this._getCached(collectionId, voiceName, text);

    if (!blob) {
      const { getToken } = await import('./auth.js');
      const { BASE_URL } = await import('./api.js');
      const token = await getToken();
      const url = `${BASE_URL}/tts/audio?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voiceName)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      blob = await res.blob();
      await this._putCached(collectionId, voiceName, text, blob);
    }

    return new Promise((resolve, reject) => {
      const url   = URL.createObjectURL(blob);
      this._audio = new Audio(url);
      this._audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      this._audio.onerror = () => { URL.revokeObjectURL(url); reject(); };
      this._audio.play().catch(reject);
    });
  }

  cancel() {
    if (this._audio) { this._audio.pause(); this._audio = null; }
  }

  // ── Cache management ─────────────────────────────────────────────

  async clearCollectionAudio(collectionId) {
    const db = await this._openDb();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('clips', 'readwrite');
      const req = tx.objectStore('clips').index('by_collection')
                    .openCursor(IDBKeyRange.only(collectionId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  async clearAllAudio() {
    const db = await this._openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite');
      tx.objectStore('clips').clear();
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  async getAudioCacheStats() {
    const db = await this._openDb();
    return new Promise((resolve) => {
      const stats = {};
      const req   = db.transaction('clips', 'readonly').objectStore('clips').openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(Object.values(stats)); return; }
        const { collectionId, blob } = cursor.value;
        if (!stats[collectionId]) stats[collectionId] = { collectionId, count: 0, totalBytes: 0 };
        stats[collectionId].count++;
        stats[collectionId].totalBytes += blob.size;
        cursor.continue();
      };
      req.onerror = () => resolve([]);
    });
  }
}

// ── AudioService singleton ────────────────────────────────────────
// Both providers are instantiated once. The active one is selected
// at call time by reading localStorage, so switching voice is instant.
class AudioService {
  constructor() {
    this._providers = {
      web_speech: new WebSpeechProvider(),
      cloud_tts:  new BackendTTSProvider(),
    };
    this._activeEl   = null;
    this._activeText = null;
  }

  _currentVoice() {
    const id = getSelectedVoiceId();
    return VOICE_OPTIONS.find(v => v.id === id) ?? VOICE_OPTIONS[0];
  }

  _currentProvider() {
    return this._providers[this._currentVoice().provider];
  }

  isAvailable() {
    return getAudioEnabled() && this._currentProvider().isAvailable();
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

    const voice = this._currentVoice();
    this._activeText = text;
    this._activeEl   = el;
    el?.classList.add('audio-playing');

    try {
      await this._currentProvider().speak(text, collectionId, voice.voiceName);
    } catch {
      // Swallow — browser may cancel on navigation
    } finally {
      if (this._activeEl === el) {
        el?.classList.remove('audio-playing');
        this._activeText = null;
        this._activeEl   = null;
      }
    }
  }

  cancel() {
    Object.values(this._providers).forEach(p => p.cancel());
    this._activeEl?.classList.remove('audio-playing');
    this._activeText = null;
    this._activeEl   = null;
  }

  async clearCollectionAudio(collectionId) {
    await Promise.all(Object.values(this._providers).map(p => p.clearCollectionAudio(collectionId)));
  }

  async clearAllAudio() {
    await Promise.all(Object.values(this._providers).map(p => p.clearAllAudio?.()));
  }

  async getAudioCacheStats() {
    return this._providers.cloud_tts.getAudioCacheStats();
  }
}

export const audioService = new AudioService();
