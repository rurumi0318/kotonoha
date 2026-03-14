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
│   ├── word.py           # WordData, Definition, FsrsData, request bodies
│   ├── deck.py           # Deck, request bodies
│   ├── collection.py     # Collection, request bodies
│   └── user.py           # UserPreferences
├── routers/
│   ├── collections.py    # CRUD + reorder for collections
│   ├── decks.py          # CRUD + reorder for decks
│   ├── words.py          # CRUD + reorder for words; furigana conversion on write
│   ├── review.py         # FSRS review submission and due-word query
│   ├── preferences.py    # User preferences
│   └── vocab.py          # Dictionary lookup with example sentences
├── services/
│   ├── firebase.py       # Firebase app initialization
│   ├── auth.py           # FastAPI dependency: Firebase JWT → user ID
│   ├── furigana.py       # Raw Japanese text → FuriganaSegment (MeCab)
│   ├── fsrs_service.py   # FSRS scheduling wrapper (fsrs v6)
│   ├── example_service.py  # SQLite example sentence lookup
│   ├── vocab_service.py    # jamdict + example attachment + async translation
│   └── translator.py       # Placeholder TranslatorService (translate_batch)
├── data/
│   ├── jamdict.db        # Compiled JMDict database (gitignored — see below)
│   └── examples.db       # Compiled example sentence database (gitignored — see below)
└── tools/
    ├── build_jamdict_db.py       # One-time script to build jamdict.db from JMdict_e
    ├── build_example_db.py       # One-time script to build examples.db from examples.utf
    ├── enrich_jlpt.py            # Enriches JLPT word lists with POS/definition from jamdict
    └── generate_jlpt_examples.py # Generates example sentences for JLPT words via Gemini API
```

See [VOCAB_LOOKUP.md](./VOCAB_LOOKUP.md) for the vocabulary lookup system, including how to build both databases.

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
          card_id:     int
          due_date:    timestamp
          last_review: timestamp | null
          stability:   float | null
          difficulty:  float | null
          step:        int | null
          state:       int   # 1=Learning, 2=Review, 3=Relearning
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
- **fugashi** — Python MeCab binding for morphological analysis
- **ipadic** — MeCab dictionary (bundled, no system install needed)

The conversion pipeline:
1. MeCab tokenizes the text into morphemes and provides katakana readings
2. Per token: align the reading to the surface by splitting on kanji/kana boundaries
3. Produce a list of `FuriganaToken` objects

This runs on every `POST`/`PATCH` for words and sentences — clients only send raw text.

## FSRS Scheduling

Spaced repetition uses the [FSRS v6](https://github.com/open-spaced-repetition/py-fsrs) algorithm via the `fsrs` package.

**Review ratings:** `1` = Again, `2` = Hard, `3` = Good, `4` = Easy

`due_date` is stored on each word document so Firestore can efficiently query all due words without loading every deck:

```
GET /review/due  →  collection_group("words")
                      .where("user_id", "==", uid)
                      .where("is_paused", "==", False)
                      .where("fsrs_data.due_date", "<=", now)
```

Requires a composite Firestore index: `(user_id ASC, is_paused ASC, fsrs_data.due_date ASC)`.

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
| GET | `/review/due` | Get all due words for the current user |
| POST | `/review/collections/{cid}/decks/{did}/words/{id}` | Submit a review rating (1–4) |

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
