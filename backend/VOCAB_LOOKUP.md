# Vocabulary Lookup — Developer Guide

## Overview

The vocab lookup system takes a Japanese word (kanji, kana, or mixed) and returns all matching dictionary entries, each with its senses and example sentences.

**Endpoint:** `GET /vocab/lookup?q=あつい`

**Response shape:**
```json
[
  {
    "idseq": 1467720,
    "kanji_forms": ["熱い"],
    "kana_forms": ["あつい"],
    "senses": [
      {
        "sense_no": 1,
        "gloss": ["hot (thing)"],
        "pos": ["adjective (keiyoushi)"],
        "examples": [
          {
            "jp": "彼は熱いストーブで手をやけどした。",
            "segments": [{"t": "彼", "r": "かれ"}, {"t": "は"}, {"t": "熱い", "r": "あつい"}, ...],
            "en": "He burnt his hand on the hot stove."
          }
        ]
      }
    ]
  }
]
```

The `segments` field uses the same `FuriganaToken` format as the rest of the app (`t` = surface text, `r` = hiragana reading, omitted for kana-only tokens).

---

## Architecture

### Why SQLite, not Firestore?

Storing ~150k sentences in Firestore would cost money per read and add 100–500ms of network latency to every lookup. Since the sentence corpus is static, we bundle a pre-built SQLite file directly into the Docker image.

| | Firestore | SQLite (bundled) |
|---|---|---|
| Latency | 100–500ms (network) | < 5ms (local) |
| Cost | Per read | Free |
| Updates | Easy | Rebuild DB + redeploy |

The database is 71.6 MB — well within Cloud Run's limits.

### Data sources

The example sentences come from the **EDRDG** (Electronic Dictionary Research and Development Group), specifically the `examples.utf` file from the Tanaka Corpus / Tatoeba project. This corpus has been manually curated and linked to JMDict dictionary entries at the sense level.

Dictionary lookups use **jamdict**, a Python library that wraps the JMDict and KanjiDic2 databases.

#### Downloading `examples.utf`

The only file needed is `examples.utf`. Download the compressed version and extract it:

| File | URL |
|---|---|
| `examples.utf.gz` | http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz |
| EDRDG file index | http://ftp.edrdg.org/pub/Nihongo/ |

```bash
# From backend/data/
curl -O http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz
gunzip examples.utf.gz
```

For a detailed explanation of the file format, see the [EDRDG Sentence-Dictionary Linking page](https://www.edrdg.org/wiki/Sentence-Dictionary_Linking.html). It documents the A/B line structure and all index element symbols (`[NN]`, `(#ent_seq)`, `~`, `{surface}`) that the build script parses.

### File layout

```
backend/
├── data/
│   ├── examples.utf          # Raw EDRDG source file (not committed)
│   └── examples.db           # Generated SQLite database (not committed)
├── tools/
│   └── build_example_db.py   # One-time build script
└── services/
    ├── example_service.py    # SQLite read-only singleton
    └── vocab_service.py      # jamdict + example attachment
```

---

## The Database

### Schema

```sql
CREATE TABLE sentences (
    id       TEXT PRIMARY KEY,   -- Tatoeba ID, e.g. "303697_100000"
    jp_text  TEXT NOT NULL,
    en_text  TEXT NOT NULL,
    segments TEXT NOT NULL       -- JSON: pre-computed FuriganaToken list
);

CREATE TABLE word_links (
    ent_seq     INTEGER,         -- JMDict entry ID (NULL if headword-only link)
    headword    TEXT,            -- Written form (NULL if ent_seq-only link)
    sense_no    INTEGER NOT NULL,
    sentence_id TEXT NOT NULL,
    is_checked  INTEGER NOT NULL DEFAULT 0,  -- 1 = high-quality EDRDG-verified link
    FOREIGN KEY(sentence_id) REFERENCES sentences(id)
);

CREATE INDEX idx_word_lookup ON word_links(ent_seq, headword, sense_no);
```

### Why pre-compute segments?

Each sentence's furigana segmentation is computed once at build time using MeCab and stored as JSON in the `segments` column. At runtime, `example_service.py` does a plain `SELECT` and `json.loads()` — no MeCab, no processing delay.

### Understanding the source data (`examples.utf`)

The file uses A/B line pairs:

```
A: 彼は熱いストーブで手をやけどした。\tHe burnt his hand on the hot stove.#ID=302304_101392
B: 彼(かれ)[01] は 熱い ストーブ で(#2028980) 手 を 火傷(やけど){やけど} 為る(する){した}
```

- **A-line**: the bilingual sentence text and its Tatoeba ID.
- **B-line**: per-token metadata. Tokens with `[NN]` are linked to a specific JMDict sense.

B-line token formats:

| Pattern | Meaning |
|---|---|
| `会う[01]` | headword `会う`, sense 1 |
| `彼(かれ)[01]` | headword `彼`, reading `かれ`, sense 1 |
| `(#2028980)[01]` | JMDict `ent_seq` 2028980, sense 1 |
| `で(#2028980)` | ent_seq link with no sense — **not indexed** |
| `{こと}` | surface form only — **not indexed** |
| `~` anywhere | sentence is EDRDG-verified (`is_checked = 1`) |

Only tokens with a `[NN]` sense marker are written to `word_links`. Tokens without one (including bare ent_seq references) are ignored during the build.

---

## Building the Database

Run this once locally before building the Docker image. Requires the Python venv with the backend dependencies installed.

```bash
cd backend
python tools/build_example_db.py
```

**Input:** `data/examples.utf`
**Output:** `data/examples.db`

The script processes ~148k sentence pairs and takes a few minutes. Progress is printed every 5,000 sentences.

Both files are gitignored. When building the Docker image, `COPY . .` in the Dockerfile picks up `data/examples.db` automatically.

> **If you update `examples.utf`**, delete the old `examples.db` and re-run the script, then rebuild and redeploy the container.

---

## Runtime: Example Service

`services/example_service.py` opens the SQLite connection once at module load (singleton) in read-only immutable mode, which allows the OS to aggressively cache the file in memory across requests.

### Tiered lookup

`get_examples(ent_seq, headword, sense_no, limit=3)` uses up to 3 tiers, stopping at the first tier that returns results:

| Tier | Query | Notes |
|---|---|---|
| 1 | `ent_seq` + `sense_no` | Exact sense match — most precise |
| 2 | `ent_seq` only | Any sense for this entry |
| 3 | `headword` + `sense_no` | Indexed text match, specific sense |

Tiers 1–2 only run when `ent_seq` is provided. Tier 3 only runs when `headword` is provided.

Only EDRDG-indexed links are used. If a word has no indexed examples, the lookup returns an empty list — consistent with how Jisho handles the same data.

Within each tier, rows with `is_checked = 1` (EDRDG-verified sentences) are returned first.

---

## Runtime: Vocab Service

`services/vocab_service.py` wraps both jamdict and the example service:

1. Calls `jamdict.lookup(text)` — returns all matching dictionary entries.
2. For each entry, for each sense (1-indexed), calls `get_examples(ent_seq, headword, sense_no)`.
3. Returns the combined structure.

The `headword` passed to `get_examples` is `kanji_forms[0]` (or `kana_forms[0]` if no kanji) — but only for the **first entry** returned by jamdict. When a lookup returns multiple entries sharing the same kanji form (e.g. 山 = やま and さん), EDRDG's headword index (`山[01]`) refers to the primary やま meaning and cannot distinguish between entries. Secondary entries receive `headword=None` and rely on ent_seq tiers only.

---

## Known Limitations

**Sparse sense coverage.** The EDRDG linking is manually curated and incomplete. Many senses, especially rare or abstract ones, have no linked sentences and return an empty list. This is intentional — showing unverified examples would be misleading.

**Static corpus.** The Tatoeba/Tanaka corpus bundled here is a snapshot. Updating it requires re-downloading `examples.utf`, re-running the build script, and redeploying.
