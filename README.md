# Kotonoha (言の葉)

A web app for memorizing Japanese vocabulary with spaced repetition. Works on both mobile and desktop browsers.

## Features

- **Vocabulary library** — organize words into collections and decks; each word stores kanji/kana, furigana, definitions, and example sentences
- **Spaced repetition (FSRS v6)** — flashcard reviews scheduled by the FSRS algorithm; supports Again / Good / Easy ratings
- **Furigana** — raw Japanese text is automatically annotated with ruby readings on the backend using SudachiPy
- **TTS audio** — text-to-speech playback for words and example sentences during review
- **Dictionary lookup** — search JMDict entries by kanji or kana; results include senses and curated example sentences from the Tatoeba/Tanaka corpus
- **Quick-add** — bulk-import a full JLPT vocabulary set (N1–N5) into a collection in one click
- **Drag-and-drop reorder** — collections, decks, and words can be reordered freely
- **Duplicate detection** — warns when a word already exists in your library (same surface + reading), but still allows it

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (ES modules) |
| Backend | Python 3.11, FastAPI |
| Database | Google Cloud Firestore |
| Authentication | Firebase Authentication (Google Login) |
| Hosting | Firebase Hosting (frontend), Google Cloud Run (backend) |

## System Architecture

```
Browser (SPA)
  └── Firebase Hosting  ──→  frontend/public/
        Hash router, no build step, plain ES modules

  └── Firebase Auth     ──→  Google Login → Firebase JWT

  └── FastAPI (Cloud Run)
        ├── Auth: JWT verified on every request → uid
        ├── Firestore: all user data (collections / decks / words / preferences)
        ├── SudachiPy: raw Japanese → FuriganaSegment (on every write)
        ├── FSRS: scheduling state stored per-word in Firestore
        ├── SQLite (bundled in image):
        │     ├── jamdict.db    ← JMDict dictionary (~150k entries)
        │     ├── examples.db   ← Tatoeba sentences, pre-segmented
        │     └── quickadd.db   ← Pre-computed JLPT word sets with furigana
        └── Google Cloud TTS API  ←  audio synthesis; MP3s cached in GCS
```

### Data flow

1. User writes a word → backend converts raw text to `FuriganaSegment` and stores in Firestore
2. Review session → backend queries Firestore for due words via `fsrs_data.due` timestamp; each rating updates FSRS state and reschedules
3. Dictionary lookup → backend queries local `jamdict.db` and attaches sentences from `examples.db` — no external API call, < 5 ms
4. Audio playback → backend fetches MP3 from GCS cache (or generates via Cloud TTS on miss); browser caches blobs in IndexedDB

### Firestore document hierarchy

```
/users/{uid}
  /collections/{cid}
    /decks/{did}
      /words/{wid}   ← fsrs_data.due indexed for review queries
```

Each parent document stores a `*_order` array for child ordering. Words include denormalized `user_id`, `collection_id`, `deck_id` to support collection-group queries.

## Documentation

| Document | Contents |
|---|---|
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Deployment commands, local dev setup |
| [backend/README.md](./backend/README.md) | API endpoints, data models, FSRS details, quick-add pipeline |
| [backend/VOCAB_LOOKUP.md](./backend/VOCAB_LOOKUP.md) | Dictionary + example sentence system, database build steps |
| [backend/TTS.md](./backend/TTS.md) | TTS providers, two-layer cache (GCS + IndexedDB), pre-generation tool |
