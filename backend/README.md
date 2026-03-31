# Backend — Kotonoha API

FastAPI backend deployed on Google Cloud Run. Handles authentication, Japanese text processing, database operations, and FSRS-based spaced repetition scheduling.

## Directory Structure

```
backend/
├── main.py               # App factory, middleware, router registration
├── Dockerfile
├── requirements.txt
├── models/
│   ├── furigana.py       # FuriganaToken, FuriganaSegment
│   ├── word.py           # WordData, Definition, FsrsData, review models, request bodies
│   ├── deck.py           # Deck, request bodies
│   ├── collection.py     # Collection, request bodies
│   └── user.py           # UserPreferences
├── routers/
│   ├── collections.py    # CRUD + reorder for collections
│   ├── decks.py          # CRUD + reorder for decks
│   ├── words.py          # CRUD + reorder for words; furigana conversion on write
│   ├── review.py         # FSRS review submission and due-word query
│   ├── preferences.py    # User preferences
│   ├── vocab.py          # Dictionary lookup with example sentences
│   └── tts.py            # TTS audio endpoint (Cloud TTS + GCS cache)
├── services/
│   ├── firebase.py       # Firebase app initialization
│   ├── auth.py           # FastAPI dependency: Firebase JWT → user ID
│   ├── furigana.py       # Raw Japanese text → FuriganaSegment (MeCab)
│   ├── fsrs_service.py   # FSRS scheduling wrapper (fsrs v6)
│   ├── example_service.py  # SQLite example sentence lookup
│   ├── vocab_service.py    # jamdict + example attachment + async translation
│   ├── translator.py       # Placeholder TranslatorService (translate_batch)
│   ├── tts_service.py      # Google Cloud TTS provider + cache key formula
│   └── audio_cache.py      # GCS-backed MP3 cache
├── data/
│   ├── jamdict.db        # Compiled JMDict database (gitignored — see below)
│   └── examples.db       # Compiled example sentence database (gitignored — see below)
└── tools/
    ├── build_jamdict_db.py       # One-time script to build jamdict.db from JMdict_e
    ├── build_example_db.py       # One-time script to build examples.db from examples.utf
    ├── enrich_jlpt.py            # Enriches JLPT word lists with POS/definition from jamdict
    ├── generate_jlpt_examples.py # Generates example sentences for JLPT words via Gemini API
    ├── migrate_fsrs_due.py       # One-time migration: due_date→due, add counters, remove card_id
    └── pregenerate_tts.py        # Pre-warms GCS audio cache for all quickadd vocabulary
```

See [VOCAB_LOOKUP.md](./VOCAB_LOOKUP.md) for the vocabulary lookup system, including how to build both databases.
See [TTS.md](./TTS.md) for the TTS provider abstraction, two-layer cache design, and audio pre-generation.

## Authentication

Every endpoint requires a Firebase ID token in the `Authorization` header:
```
Authorization: Bearer <firebase-id-token>
```

The `get_current_user` dependency verifies the token via Firebase Admin SDK and returns the `uid`. All data is scoped to that `uid` — users can only access their own data.

## Data Structure

### FuriganaSegment

Japanese text is stored with reading annotations (furigana) to support display on the frontend. The backend converts raw Japanese input to this format automatically — clients never need to construct it manually.

```json
{
  "surface": "重い荷物",
  "segments": [
    { "t": "重", "r": "おも" },
    { "t": "い" },
    { "t": "荷物", "r": "にもつ" }
  ],
  "en": "heavy luggage"
}
```

- `t`: surface text of this segment
- `r`: hiragana reading — omitted for kana-only segments
- `en`: English translation — used for sentences, optional for words

### Firestore Document Hierarchy

```
/users/{userId}
  preferences: {}
  collection_order: ["col_1", "col_2", ...]

  /collections/{collectionId}
    name: string
    deck_order: ["deck_1", "deck_2", ...]

    /decks/{deckId}
      name: string
      tag:  string
      word_order: ["word_1", "word_2", ...]

      /words/{wordId}
        user_id:       string   # denormalized for collection group queries
        collection_id: string   # denormalized for duplicate reporting
        deck_id:       string   # denormalized for duplicate reporting
        word:          FuriganaSegment
        kana_hint:     string   # reading disambiguation (e.g. "にんき" vs "ひとけ")
        definitions: [
          {
            english_definition: string
            sentences: [FuriganaSegment, ...]
          }
        ]
        user_notes: string
        is_paused:  bool
        fsrs_data: {
          due:            timestamp
          last_review:    timestamp | null
          stability:      float | null
          difficulty:     float | null
          step:           int | null
          state:          int   # 1=Learning, 2=Review, 3=Relearning
          scheduled_days: int   # interval (days) assigned at last review
          review_count:   int   # total number of reviews
          lapse_count:    int   # times forgotten (Again while in Review)
        }
```

### Custom Ordering

Each parent document stores a `*_order` array of child IDs. This array is the source of truth for display order.

- **Create**: new ID is appended to the parent's order array atomically (`ArrayUnion`)
- **Delete**: ID is removed from the parent's order array atomically (`ArrayRemove`)
- **Reorder**: `PUT .../order` replaces the entire order array

### Duplicate Detection

When creating a word, the backend queries all of the user's words for the same `word.surface` using a Firestore **collection group query**, then filters in Python by `kana_hint`. Two words are considered duplicates only when both `word.surface` **and** `kana_hint` match — allowing homographs with different readings (e.g. `人気(にんき)` and `人気(ひとけ)`) to coexist without a warning. If duplicates are found, the response includes their collection and deck names so the client can warn the user. The word is still created regardless.

Requires a composite Firestore index: `(user_id ASC, word.surface ASC)`.

## Furigana Conversion

Raw Japanese text is converted to `FuriganaSegment` in `services/furigana.py` using:
- **SudachiPy** (`sudachidict_full`) — morphological analyser and tokeniser
- **jaconv** — katakana → hiragana conversion for readings

The conversion pipeline:
1. SudachiPy tokenises the text into morphemes (split mode C) and provides a katakana reading per token
2. The reading is converted to hiragana with jaconv
3. Pure-kana tokens are emitted as-is (no annotation needed)
4. Kanji-containing tokens are passed to `_align_reading`, which splits the surface and reading into per-segment `{"t", "r"}` pairs

This runs on every `POST`/`PATCH` for words and sentences — clients only send raw text.

### Reading alignment (`_align_reading`)

A naive split — "assign the whole reading to the kanji block, strip matching okurigana from the end" — fails in several common cases. The implementation uses a **lookahead okurigana search** instead:

For each kanji block in the surface:
1. Collect the **okurigana** (hiragana characters immediately following the block).
2. Search for that okurigana string inside the remaining reading, iterating all occurrences and keeping the **last valid match**. "Valid" means either the surface has more characters after the okurigana, or the reading has more characters after it — preventing an early match from consuming too little of the reading.
3. Assign everything in the reading up to that match position as the kanji block's reading.

This correctly handles the three problem cases:

| Case | Surface | Reading | Result |
|---|---|---|---|
| Repeated kana in okurigana | 可愛い | かわいい | 可愛[かわい] + い |
| Interleaved kana/kanji | 辿り着く | たどりつく | 辿[たど] + り + 着[つ] + く |
| Long okurigana | 教える | おしえる | 教[おし] + える |

The "repeated kana" case (可愛い) is the critical one: the okurigana `い` appears twice in `かわいい`. A first-match strategy would assign only `かわ` to `可愛`; the last-match strategy correctly assigns `かわい`.

## FSRS Scheduling

Spaced repetition uses the [FSRS v6](https://github.com/open-spaced-repetition/py-fsrs) algorithm via the `fsrs` package.

**Review ratings:** `1` = Again, `3` = Good, `4` = Easy (Hard is not used)

`fsrs_data.due` is stored on each word document so Firestore can efficiently query all due words without loading every deck. The review endpoint supports filtering by collection and/or deck, early review, and batching based on the user's `daily_review_limit` preference.

```
GET /review/due  →  collection_group("words")
                      .where("user_id", "==", uid)
                      .where("is_paused", "==", False)
                      .where("fsrs_data.due", "<=", now)
                      .order_by("fsrs_data.due")
                      .limit(daily_review_limit * 1.5)   # over-fetch pool
                    → shuffle(pool)[:daily_review_limit]  # random subset
```

Optional query params: `collection_id`, `deck_ids` (comma-separated, max 30), `early` (bool).

**Composite Firestore indexes** (collection group `words`):
- `(user_id ASC, is_paused ASC, fsrs_data.due ASC)` — main due query
- `(user_id ASC, is_paused ASC, collection_id ASC, fsrs_data.due ASC)` — single-collection filter
- `(user_id ASC, is_paused ASC, deck_id ASC, fsrs_data.due ASC)` — deck-level filter

## API Endpoints

### Collections
| Method | Path | Description |
|--------|------|-------------|
| GET | `/collections` | List all collections (ordered) |
| POST | `/collections` | Create a collection |
| PATCH | `/collections/{id}` | Rename a collection |
| DELETE | `/collections/{id}` | Delete collection and all its decks/words |
| PUT | `/collections/order` | Set collection order |

### Decks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/collections/{cid}/decks` | List decks in a collection (ordered) |
| POST | `/collections/{cid}/decks` | Create a deck |
| PATCH | `/collections/{cid}/decks/{id}` | Rename deck or edit tag |
| DELETE | `/collections/{cid}/decks/{id}` | Delete deck and all its words |
| PUT | `/collections/{cid}/decks/order` | Set deck order |

### Words
| Method | Path | Description |
|--------|------|-------------|
| GET | `/collections/{cid}/decks/{did}/words` | List words in a deck (ordered) |
| POST | `/collections/{cid}/decks/{did}/words` | Create a word (furigana converted automatically) |
| PATCH | `/collections/{cid}/decks/{did}/words/{id}` | Edit word, definitions, notes, or pause state |
| DELETE | `/collections/{cid}/decks/{did}/words/{id}` | Delete a word |
| PUT | `/collections/{cid}/decks/{did}/words/order` | Set word order |

### Review
| Method | Path | Description |
|--------|------|-------------|
| GET | `/review/due` | Get due words (optional: `?collection_id=&deck_ids=&early=true`) |
| POST | `/review/collections/{cid}/decks/{did}/words/{id}` | Submit a review rating (1, 3, or 4) |

### Preferences
| Method | Path | Description |
|--------|------|-------------|
| GET | `/preferences` | Get user preferences |
| PUT | `/preferences` | Update user preferences |

### Vocabulary Lookup
| Method | Path | Description |
|--------|------|-------------|
| GET | `/vocab/lookup?q={text}` | Dictionary lookup with senses and example sentences |

See [VOCAB_LOOKUP.md](./VOCAB_LOOKUP.md) for full details.

### TTS
| Method | Path | Description |
|--------|------|-------------|
| GET | `/tts/audio?text={text}&voice={voice}` | Synthesize Japanese text to MP3 (rate-limited: 60 req/min) |

See [TTS.md](./TTS.md) for full details.

## JLPT Word Data Pipeline

A two-step local pipeline that builds enriched JLPT word lists with POS, definitions, and AI-generated example sentences. All output files are gitignored (under `backend/data/`).

### Source files

```
backend/data/jlpt/
  term_meta_bank_1.json   # N1 words (~3200)
  term_meta_bank_2.json   # N2 words (~1900)
  term_meta_bank_3.json   # N3 words (~1700)
  term_meta_bank_4.json   # N4 words (~640)
  term_meta_bank_5.json   # N5 words (~700)
```

Each entry format: `[word, "freq", {"reading": "...", "frequency": {...}}]`

---

### Step 1 — Enrich with POS and definition (`enrich_jlpt.py`)

Uses the local `jamdict.db` to look up each word and extract its primary part-of-speech and English definition. No internet connection or API key required.

```powershell
cd backend
.venv\Scripts\python tools\enrich_jlpt.py
```

**Output** — one file per source, e.g. `term_meta_bank_1_enriched.json`:

```json
[
  {
    "word": "人気",
    "reading": "にんき",
    "idseq": 1367010,
    "pos": "noun (common) (futsuumeishi)",
    "definition": "popularity, public favor"
  },
  ...
]
```

The script matches entries by `reading` against `kana_forms` in jamdict, so homographs like `人気(にんき)` and `人気(ひとけ)` each map to the correct dictionary entry. `idseq` is the JMdict entry ID, used as a stable key in subsequent steps. Entries with no jamdict match get `"idseq": null`.

---

### Step 2 — Generate example sentences (`generate_jlpt_examples.py`)

Calls the Gemini API to generate one natural example sentence (Japanese + English translation) per word. Requires a Google AI Studio API key.

#### Prerequisites

```powershell
# Set your API key for the current terminal session (never committed to git)
$env:GEMINI_API_KEY = "your_key_here"
```

The script reads `GEMINI_API_KEY` from the environment and exits with an error if it is missing.

#### Running

```powershell
cd backend

# Process all 5 files (default: 100 words/batch, 1 API call/min)
.venv\Scripts\python tools\generate_jlpt_examples.py

# Process a single file (useful for testing — file 5 is smallest at ~700 words)
.venv\Scripts\python tools\generate_jlpt_examples.py --file 5

# Faster if you have a paid API key
.venv\Scripts\python tools\generate_jlpt_examples.py --batch-size 100 --rpm 15
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--batch-size N` | 100 | Words sent per API call |
| `--rpm N` | 1 | API calls per minute (free tier limit: 15 RPM) |
| `--file N` | all | Process only file N (1–5) |

#### Progress and resuming

After each successful batch the script writes a progress file:

```
backend/data/jlpt/term_meta_bank_{n}_examples_progress.json
```

If the script is interrupted (Ctrl+C, quota error, network issue), just re-run the same command — it skips completed batches and continues from where it stopped. The progress file is deleted automatically once all batches for a file are done.

#### Output — `term_meta_bank_{n}_examples.json`

```json
[
  {
    "idseq": 1367010,
    "word": "人気",
    "reading": "にんき",
    "example_jp": "このバンドは若者の間でとても人気があります。",
    "example_en": "This band is very popular among young people."
  },
  {
    "idseq": null,
    "word": "嚙る",
    "reading": "かじる",
    "example_jp": "",
    "example_en": ""
  },
  ...
]
```

`example_jp` and `example_en` are empty strings when the AI cannot find a suitable example (rare or archaic words). Results are mapped back to source entries using `idseq` as the primary key, with `word:reading` as a fallback for the one `null`-idseq entry.

---

## Quick-Add Vocabulary Database

The quick-add feature lets users bulk-import a full vocabulary set (N1–N5, or any future set) directly into a collection. To avoid runtime cost, all data is pre-computed into a single SQLite database bundled in the Docker image.

### Overview

```
backend/
├── data/
│   └── quickadd.db              # Pre-built database (gitignored, bundled in Docker)
├── tools/
│   └── build_quickadd_db.py     # Build tool — run once after the JLPT pipeline
└── services/
    └── quickadd_service.py      # Read-only runtime service
```

### What `build_quickadd_db.py` pre-computes

For each word in the source examples file:

1. **Looks up the jamdict entry by `idseq`** (direct ID lookup, no text search) to get the primary sense's English gloss and part-of-speech. For words with no `idseq` (no jamdict match), falls back to a reading-disambiguated text lookup; if still no match, definition is left empty.
2. **Runs MeCab** to compute furigana for both the word surface and the example sentence. Furigana is stored as pre-serialised JSON — no MeCab runs at request time.
3. **Writes rows** to `quickadd.db` with language-independent data in `quickadd_words` and English strings in `quickadd_translations` (see schema below).

### Building `quickadd.db`

`quickadd.db` depends on `jamdict.db` and the JLPT examples files. Build them first if they don't exist (see sections above), then:

```powershell
cd backend
.venv\Scripts\python tools\build_quickadd_db.py
```

The tool is idempotent — re-running it replaces existing data cleanly.

**Full build order from scratch:**

```powershell
# 1. Dictionary database (one-time)
.venv\Scripts\python tools\build_jamdict_db.py

# 2. JLPT enrichment (one-time per source file)
.venv\Scripts\python tools\enrich_jlpt.py

# 3. Gemini example sentences (one-time, requires GEMINI_API_KEY)
$env:GEMINI_API_KEY = "your_key_here"
.venv\Scripts\python tools\generate_jlpt_examples.py

# 4. Quick-add database (re-run whenever examples or vocab sets change)
.venv\Scripts\python tools\build_quickadd_db.py
```

### Adding a new vocabulary set

1. Prepare an examples file with this schema (same format as the JLPT files):

```json
[
  {
    "idseq": 1198180,
    "word": "会う",
    "reading": "あう",
    "example_jp": "友達に会います。",
    "example_en": "I will meet a friend."
  }
]
```

`idseq` is the JMDict entry ID (used for accurate dictionary lookup). Set to `null` if unknown — the tool will fall back to a text search.

2. Add one entry to `VOCAB_SETS` in `tools/build_quickadd_db.py`:

```python
{"set_id": "core_2k", "display_name": "Core 2000", "examples_file": "core2k_examples.json"},
```

3. Re-run `build_quickadd_db.py`. The new set is immediately served by `GET /quickadd/sets` and `POST /collections/{cid}/quickadd`.

### Database schema

```sql
-- Vocabulary set metadata (one row per set)
CREATE TABLE vocab_sets (
    set_id       TEXT PRIMARY KEY,   -- "jlpt_n5"
    display_name TEXT NOT NULL,      -- "JLPT N5"
    word_count   INTEGER NOT NULL
);

-- Language-independent word data (word surface, reading, furigana, example JP)
CREATE TABLE quickadd_words (
    set_id        TEXT    NOT NULL,
    word_no       INTEGER NOT NULL,  -- stable insertion order (0-based)
    word          TEXT    NOT NULL,  -- surface form (kanji or kana)
    reading       TEXT    NOT NULL,  -- kana reading
    pos           TEXT,              -- part of speech
    word_furigana TEXT    NOT NULL,  -- JSON: pre-computed FuriganaSegment
    example_jp    TEXT    NOT NULL,  -- Japanese example sentence
    sent_furigana TEXT,              -- JSON: pre-computed FuriganaSegment (null = no example)
    PRIMARY KEY (set_id, word_no)
);

-- Language-specific strings (one row per word per language)
CREATE TABLE quickadd_translations (
    set_id     TEXT NOT NULL,
    word_no    INTEGER NOT NULL,
    lang       TEXT NOT NULL,        -- "en" (default); "zh", "ko", etc. in future
    definition TEXT NOT NULL,        -- translated gloss
    example_en TEXT NOT NULL,        -- translated example sentence
    PRIMARY KEY (set_id, word_no, lang),
    FOREIGN KEY (set_id, word_no) REFERENCES quickadd_words(set_id, word_no)
);
```

The split between `quickadd_words` and `quickadd_translations` is intentional: the Japanese content never changes across languages, so it is stored once. Only `definition` and `example_en` are language-specific.

### Adding a translation (future L10n)

When a user's language preference is set to something other than English, the import endpoint passes that `lang` code to `quickadd_service.get_words(set_id, lang=...)`, which joins against `quickadd_translations` on that language.

To add a new language (e.g. Traditional Chinese, `zh-TW`):

1. Translate the `definition` and `example_en` fields for all words in the set offline (script + translation API, or manually).
2. Insert rows into `quickadd_translations` with `lang = "zh-TW"`. The `quickadd_words` rows are shared — no duplication of Japanese data.
3. No schema changes, no code changes required. The service and router already pass `lang` through.

> **Note:** L10n is not implemented in the current stage. The `lang` column exists in the schema to make the future addition non-breaking. All current data has `lang = "en"`.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/quickadd/sets` | List all available vocabulary sets |
| POST | `/collections/{cid}/quickadd` | Bulk-import a set into a collection |

**POST body:** `{ "set_id": "jlpt_n5" }`

**POST response:** `{ "decks_created": 36, "words_created": 705 }`

Each deck holds 20 words and is named `"JLPT N5, 001"`, `"JLPT N5, 002"`, etc. The deck tag is set to the set's `display_name` (e.g. `"JLPT N5"`).
