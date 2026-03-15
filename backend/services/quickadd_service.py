"""
Read-only SQLite service for the pre-built quick-add vocabulary database.

The connection is opened once at module level (singleton) in immutable
read-only mode, same pattern as example_service.py.

Run `python tools/build_quickadd_db.py` to build data/quickadd.db.
"""

import json
import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent / "data" / "quickadd.db"
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn

    if not _DB_PATH.exists():
        raise RuntimeError(
            f"quickadd.db not found at {_DB_PATH}. "
            "Run `python tools/build_quickadd_db.py` first."
        )

    uri = _DB_PATH.as_uri() + "?mode=ro&immutable=1"
    _conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    return _conn


def get_vocab_sets() -> list[dict]:
    """Return all available vocabulary sets ordered by set_id."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT set_id, display_name, word_count FROM vocab_sets ORDER BY set_id"
    ).fetchall()
    return [dict(r) for r in rows]


def get_words(set_id: str, lang: str = "en") -> list[dict]:
    """
    Return all words for a vocabulary set in insertion order.

    Each dict contains the pre-built data ready to write to Firestore:
      word, reading, pos, word_furigana (parsed), example_jp,
      sent_furigana (parsed or None), definition, example_en
    """
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT w.word, w.reading, w.pos,
               w.word_furigana, w.example_jp, w.sent_furigana,
               t.definition, t.example_en
        FROM quickadd_words w
        JOIN quickadd_translations t
          ON t.set_id = w.set_id AND t.word_no = w.word_no AND t.lang = ?
        WHERE w.set_id = ?
        ORDER BY w.word_no
        """,
        (lang, set_id),
    ).fetchall()

    result = []
    for r in rows:
        result.append({
            "word":          r["word"],
            "reading":       r["reading"],
            "pos":           r["pos"],
            "word_furigana": json.loads(r["word_furigana"]),
            "example_jp":    r["example_jp"],
            "sent_furigana": json.loads(r["sent_furigana"]) if r["sent_furigana"] else None,
            "definition":    r["definition"],
            "example_en":    r["example_en"],
        })
    return result
