# TTS (Text-to-Speech) — Developer Guide

## Overview

Audio playback is available during review for words and example sentences. The frontend supports two providers, selectable per-user in Settings:

| Provider | Voice | Notes |
|---|---|---|
| **Google Cloud TTS** (default) | `ja-JP-Chirp3-HD-Leda` | High-quality neural voice; routed through the backend |
| **Web Speech API** | Browser default | Free, no backend call; quality varies by browser/OS |

---

## Architecture

```
Frontend (audio.js)
  └── BackendTTSProvider
        1. Check IndexedDB cache  → hit: play blob directly
        2. Miss: GET /tts/audio?text=...&voice=...
              └── Backend (tts.py)
                    1. Check GCS bucket   → hit: return cached MP3
                    2. Miss: call Google Cloud TTS API → upload to GCS → return MP3
        3. Store response blob in IndexedDB
        4. Play via HTMLAudioElement

  └── WebSpeechProvider
        → window.speechSynthesis (no backend, no cache)
```

Audio is stored and played as MP3. The GCS bucket (`kotonoha-tts`) acts as a shared server-side cache across all users and container instances; IndexedDB is a per-browser cache that avoids repeat network requests within a session.

---

## Cache Key

Both layers use the same normalization and key formula to stay consistent:

```
normalized_text = NFKC(text).strip().collapse_whitespace()
key             = SHA-256(voice_name + normalized_text)   # hex digest
```

Python (`services/tts_service.py`): `cache_key(voice_name, text)`
JavaScript (`audio.js`): `_normalizeText(text)` + the same SHA-256 logic on the backend

GCS object path: `tts/{key}.mp3`

---

## Backend

### Endpoint

```
GET /tts/audio?text={text}&voice={voice_name}
Authorization: Bearer <firebase-id-token>
```

Returns `audio/mpeg` with `Cache-Control: public, max-age=86400`.

`voice` defaults to the `TTS_VOICE_NAME` environment variable (`ja-JP-Chirp3-HD-Leda`).

### Rate limiting

60 requests per user per 60-second window (in-memory, resets on container restart). Exceeding it returns HTTP 429.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `TTS_VOICE_NAME` | `ja-JP-Chirp3-HD-Leda` | Default Cloud TTS voice |
| `TTS_LANGUAGE_CODE` | `ja-JP` | Language code sent to Cloud TTS |
| `TTS_BUCKET_NAME` | `kotonoha-tts` | GCS bucket for audio cache |

---

## Frontend cache (IndexedDB)

Database: `kotonoha-audio` (v2)
Object store: `clips`
Key path: `[collectionId, voiceName, textKey]`
Index: `by_collection` on `collectionId`

Each record stores the audio `Blob`, `cachedAt` timestamp, and the key components. The `collectionId` field allows per-collection cache clearing (Settings → clear audio cache). `clearAllAudio()` wipes the entire store.

---

## Pre-generating audio for JLPT vocabulary

To warm the GCS cache for all quick-add words and sentences before users encounter them, run `tools/pregenerate_tts.py`. It reads from `quickadd.db`, computes the same cache keys as the live backend, skips already-cached entries, and uploads new MP3s directly to GCS.

```bash
cd backend

# Preview what would be generated (no API calls, no cost)
.venv/Scripts/python tools/pregenerate_tts.py --dry-run

# Generate everything (words + sentences) for the default voice
.venv/Scripts/python tools/pregenerate_tts.py

# Generate only word surfaces
.venv/Scripts/python tools/pregenerate_tts.py --content words

# Generate for multiple voices at once
.venv/Scripts/python tools/pregenerate_tts.py --voices ja-JP-Chirp3-HD-Leda,ja-JP-Chirp3-HD-Aoede
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--voices` | `TTS_VOICE_NAME` env var | Comma-separated Cloud TTS voice names |
| `--content` | `all` | `words`, `sentences`, or `all` |
| `--dry-run` | off | Check cache hits/misses without calling the API |

The tool prints estimated cost (Chirp 3 HD = $30 / 1M characters) and skips any text already in GCS, so it is safe to re-run. Run it after rebuilding `quickadd.db` when adding a new vocabulary set or voice.

---

## Adding a voice

1. Pick a voice name from the [Google Cloud TTS voice list](https://cloud.google.com/text-to-speech/docs/voices).
2. Add an entry to `VOICE_OPTIONS` in `frontend/public/audio.js`:
   ```js
   { id: 'aoede', label: 'Aoede', provider: 'cloud_tts', voiceName: 'ja-JP-Chirp3-HD-Aoede' },
   ```
3. Pre-generate its audio with `pregenerate_tts.py --voices <voice_name>` before deploying.

No backend changes are needed — the voice name is passed through as a query parameter.
