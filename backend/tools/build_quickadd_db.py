"""
Build the pre-computed quick-add database (data/quickadd.db).

For each vocabulary set, this tool:
  1. Reads the _examples.json file (word list + Gemini examples + idseq)
  2. Queries jamdict by idseq to get definition (gloss) and POS
     - Fallback for null idseq: text lookup by word + reading (same as enrich_jlpt.py)
     - No jamdict match: word included with empty definition
  3. Pre-computes furigana for word surface and example sentence
  4. Writes rows to data/quickadd.db

Adding a new vocabulary set: add one entry to VOCAB_SETS below, provide an
examples file in the same format as term_meta_bank_x_examples.json, and re-run.

Run from the backend/ directory:
    python tools/build_quickadd_db.py
"""

import json
import sqlite3
import sys
from pathlib import Path

# ── Add backend/ to sys.path so we can import services/furigana ───────────
sys.path.insert(0, str(Path(__file__).parent.parent))

from jamdict import Jamdict

from services.furigana import text_to_furigana_segment

DATA_DIR = Path(__file__).parent.parent / "data"
DB_PATH = DATA_DIR / "quickadd.db"
JAMDICT_PATH = DATA_DIR / "jamdict.db"

# ── Vocabulary set configuration ───────────────────────────────────────────
# To add a new set: add an entry here with a matching examples_file.
# examples_file path is relative to DATA_DIR.
# The examples file must be a JSON array of objects with:
#   { "idseq": int|null, "word": str, "reading": str,
#     "example_jp": str, "example_en": str }

VOCAB_SETS = [
    {
        "set_id": "jlpt_n1",
        "display_name": "JLPT N1",
        "examples_file": "jlpt/term_meta_bank_1_examples.json",
    },
    {
        "set_id": "jlpt_n2",
        "display_name": "JLPT N2",
        "examples_file": "jlpt/term_meta_bank_2_examples.json",
    },
    {
        "set_id": "jlpt_n3",
        "display_name": "JLPT N3",
        "examples_file": "jlpt/term_meta_bank_3_examples.json",
    },
    {
        "set_id": "jlpt_n4",
        "display_name": "JLPT N4",
        "examples_file": "jlpt/term_meta_bank_4_examples.json",
    },
    {
        "set_id": "jlpt_n5",
        "display_name": "JLPT N5",
        "examples_file": "jlpt/term_meta_bank_5_examples.json",
    },
]


# ── jamdict helpers ────────────────────────────────────────────────────────

def _get_sense_data(jam: Jamdict, idseq: int | None, word: str, reading: str) -> dict:
    """
    Return {"definition": str, "pos": str} for the primary sense of a word.

    Lookup order:
      1. idseq is known → fetch entry directly by ID via underlying SQLite
      2. idseq is None  → text lookup by word, disambiguate by reading
      3. No match       → return empty strings
    """
    entry = None

    if idseq is not None:
        entry = jam.get_entry(str(idseq))
    else:
        # Fallback: text search + reading disambiguation (same as enrich_jlpt.py)
        result = jam.lookup(word)
        if result.entries:
            for e in result.entries:
                kana_forms = [k.text for k in e.kana_forms]
                if reading in kana_forms:
                    entry = e
                    break
            if entry is None:
                entry = result.entries[0]

    if entry is None:
        return {"definition": "", "pos": ""}

    for sense in entry.senses:
        glosses = [g.text for g in sense.gloss]
        if not glosses:
            continue
        pos_list = list(sense.pos)
        return {
            "definition": ", ".join(glosses),
            "pos": pos_list[0] if pos_list else "",
        }

    return {"definition": "", "pos": ""}


# ── Schema ─────────────────────────────────────────────────────────────────

_DDL = """
CREATE TABLE IF NOT EXISTS vocab_sets (
    set_id       TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    word_count   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quickadd_words (
    set_id        TEXT    NOT NULL,
    word_no       INTEGER NOT NULL,
    word          TEXT    NOT NULL,
    reading       TEXT    NOT NULL,
    pos           TEXT,
    word_furigana TEXT    NOT NULL,
    example_jp    TEXT    NOT NULL DEFAULT '',
    sent_furigana TEXT,
    PRIMARY KEY (set_id, word_no)
);

CREATE TABLE IF NOT EXISTS quickadd_translations (
    set_id     TEXT NOT NULL,
    word_no    INTEGER NOT NULL,
    lang       TEXT NOT NULL DEFAULT 'en',
    definition TEXT NOT NULL,
    example_en TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (set_id, word_no, lang),
    FOREIGN KEY (set_id, word_no) REFERENCES quickadd_words(set_id, word_no)
);

CREATE INDEX IF NOT EXISTS idx_quickadd_lookup
    ON quickadd_words(set_id, word_no);
"""


# ── Processing ─────────────────────────────────────────────────────────────

def process_set(conn: sqlite3.Connection, jam: Jamdict, cfg: dict) -> None:
    set_id = cfg["set_id"]
    display_name = cfg["display_name"]
    examples_path = DATA_DIR / cfg["examples_file"]

    if not examples_path.exists():
        print(f"  SKIP {set_id}: {examples_path} not found")
        return

    # Remove existing data for this set so re-runs are idempotent
    conn.execute("DELETE FROM quickadd_translations WHERE set_id = ?", (set_id,))
    conn.execute("DELETE FROM quickadd_words WHERE set_id = ?", (set_id,))
    conn.execute("DELETE FROM vocab_sets WHERE set_id = ?", (set_id,))

    examples = json.loads(examples_path.read_text(encoding="utf-8"))
    total = len(examples)
    print(f"  {display_name}: {total} words")

    for word_no, entry in enumerate(examples):
        word    = entry["word"]
        reading = entry["reading"]
        idseq   = entry.get("idseq")
        ex_jp   = entry.get("example_jp", "")
        ex_en   = entry.get("example_en", "")

        sense = _get_sense_data(jam, idseq, word, reading)

        word_furigana = json.dumps(
            text_to_furigana_segment(word), ensure_ascii=False
        )
        sent_furigana = (
            json.dumps(
                text_to_furigana_segment(ex_jp, en=ex_en), ensure_ascii=False
            )
            if ex_jp
            else None
        )

        conn.execute(
            "INSERT INTO quickadd_words VALUES (?,?,?,?,?,?,?,?)",
            (set_id, word_no, word, reading, sense["pos"],
             word_furigana, ex_jp, sent_furigana),
        )
        conn.execute(
            "INSERT INTO quickadd_translations VALUES (?,?,?,?,?)",
            (set_id, word_no, "en", sense["definition"], ex_en),
        )

        if (word_no + 1) % 100 == 0 or (word_no + 1) == total:
            print(f"    {word_no + 1}/{total}", end="\r", flush=True)

    print()  # newline after progress
    conn.execute(
        "INSERT INTO vocab_sets VALUES (?,?,?)",
        (set_id, display_name, total),
    )
    conn.commit()
    print(f"  -> {set_id} done ({total} words)")


def main() -> None:
    if not JAMDICT_PATH.exists():
        print(f"ERROR: jamdict.db not found at {JAMDICT_PATH}", file=sys.stderr)
        print("Run `python tools/build_jamdict_db.py` first.", file=sys.stderr)
        sys.exit(1)

    jam = Jamdict(db_file=str(JAMDICT_PATH), auto_config=False)

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(_DDL)

    for cfg in VOCAB_SETS:
        print(f"Processing {cfg['display_name']}…")
        process_set(conn, jam, cfg)

    conn.close()
    print(f"\nDone -> {DB_PATH}")


if __name__ == "__main__":
    main()
