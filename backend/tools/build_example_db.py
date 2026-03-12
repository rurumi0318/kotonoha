#!/usr/bin/env python3
"""
Build the examples SQLite database from examples.utf.

Run once locally before building the Docker image:
    cd backend
    python tools/build_example_db.py

Input:  data/examples.utf
Output: data/examples.db
"""

import json
import re
import sqlite3
import sys
from pathlib import Path

# Allow importing backend services
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.furigana import text_to_furigana_segment

DATA_DIR = Path(__file__).parent.parent / "data"
INPUT_FILE = DATA_DIR / "examples.utf"
OUTPUT_DB = DATA_DIR / "examples.db"

_DDL = """
CREATE TABLE sentences (
    id       TEXT PRIMARY KEY,
    jp_text  TEXT NOT NULL,
    en_text  TEXT NOT NULL,
    segments TEXT NOT NULL
);

CREATE TABLE word_links (
    ent_seq     INTEGER,
    headword    TEXT,
    sense_no    INTEGER NOT NULL,
    sentence_id TEXT NOT NULL,
    is_checked  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(sentence_id) REFERENCES sentences(id)
);
"""


def _parse_b_line(line_b: str) -> list[dict]:
    """
    Extract word→sense links from a B-line.

    Each token with a sense marker [NN] is captured as either:
      - ent_seq link  when the token ends with (#nnnnnnn)
      - headword link otherwise

    The `~` marker anywhere on the line means the whole sentence is
    considered "checked" (high-quality for the indexed words).
    """
    is_checked = 1 if "~" in line_b else 0
    links: list[dict] = []
    seen: set[tuple] = set()

    for m in re.finditer(r"(\S+?)\[(\d+)\]", line_b):
        prefix = m.group(1)
        sense_no = int(m.group(2))

        # Check for explicit ent_seq: prefix ends with (#nnnnnnn)
        ent_m = re.search(r"\(#(\d+)\)$", prefix)
        if ent_m:
            key = ("ent_seq", int(ent_m.group(1)), sense_no)
            if key not in seen:
                seen.add(key)
                links.append({
                    "ent_seq": int(ent_m.group(1)),
                    "headword": None,
                    "sense_no": sense_no,
                    "is_checked": is_checked,
                })
        else:
            # Strip reading (hiragana/katakana in parens) and surface {forms}
            headword = re.sub(r"\(.*?\)", "", prefix)
            headword = re.sub(r"\{.*?\}", "", headword).strip()
            if not headword:
                continue
            key = ("hw", headword, sense_no)
            if key not in seen:
                seen.add(key)
                links.append({
                    "ent_seq": None,
                    "headword": headword,
                    "sense_no": sense_no,
                    "is_checked": is_checked,
                })

    return links


def build(input_path: Path, db_path: Path) -> None:
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.executescript(_DDL)

    total = 0
    furigana_errors = 0

    with open(input_path, encoding="utf-8") as f:
        while True:
            line_a = f.readline()
            line_b = f.readline()
            if not line_a or not line_b:
                break

            m = re.match(r"A:\s*(.*?)\t(.*?)#ID=(\d+_\d+)", line_a)
            if not m:
                continue

            jp_text = m.group(1).strip()
            en_text = m.group(2).strip()
            tatoeba_id = m.group(3)

            try:
                seg = text_to_furigana_segment(jp_text)
                segments_json = json.dumps(seg["segments"], ensure_ascii=False)
            except Exception:
                furigana_errors += 1
                segments_json = "[]"

            cur.execute(
                "INSERT OR IGNORE INTO sentences VALUES (?, ?, ?, ?)",
                (tatoeba_id, jp_text, en_text, segments_json),
            )

            for lk in _parse_b_line(line_b):
                cur.execute(
                    "INSERT INTO word_links VALUES (?, ?, ?, ?, ?)",
                    (lk["ent_seq"], lk["headword"], lk["sense_no"], tatoeba_id, lk["is_checked"]),
                )

            total += 1
            if total % 5000 == 0:
                conn.commit()
                print(f"  {total:,} sentences processed...")

    conn.commit()

    # Build index after bulk insert — much faster than building incrementally
    cur.execute("CREATE INDEX idx_word_lookup ON word_links(ent_seq, headword, sense_no);")
    conn.commit()
    conn.close()

    size_mb = db_path.stat().st_size / 1024 / 1024
    print(f"\nDone.")
    print(f"  Sentences:       {total:,}")
    print(f"  Furigana errors: {furigana_errors:,}")
    print(f"  Output:          {db_path}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    if not INPUT_FILE.exists():
        print(f"Error: input file not found: {INPUT_FILE}", file=sys.stderr)
        sys.exit(1)

    print(f"Input:  {INPUT_FILE}")
    print(f"Output: {OUTPUT_DB}")
    print()
    build(INPUT_FILE, OUTPUT_DB)
