"""
Read-only SQLite service for example sentences.

The connection is opened once at module level (singleton) and reused across
all requests. The database is opened in immutable read-only mode to allow the
OS to aggressively page-cache the file.
"""

import json
import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent / "data" / "examples.db"
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn

    if not _DB_PATH.exists():
        raise RuntimeError(
            f"examples.db not found at {_DB_PATH}. "
            "Run `python tools/build_example_db.py` first."
        )

    uri = _DB_PATH.as_uri() + "?mode=ro&immutable=1"
    _conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    return _conn


def get_examples(
    ent_seq: int | None,
    headword: str | None,
    sense_no: int,
    limit: int = 3,
) -> list[dict]:
    """
    Return up to `limit` example sentences for a JMDict entry/sense.

    Tiered lookup — stops at the first tier that returns results:
      1. ent_seq + sense_no   (exact sense match)
      2. ent_seq only         (any sense for this entry)
      3. headword + sense_no  (indexed text match, specific sense)

    Only EDRDG-indexed links are used. Words with no indexed examples
    return an empty list — consistent with how Jisho handles the same data.

    Each result: {"jp": str, "segments": list[dict], "en": str}
    """
    conn = _get_conn()

    tiers: list[tuple[str, tuple]] = []

    if ent_seq is not None:
        tiers.append((
            "SELECT s.jp_text, s.en_text, s.segments"
            " FROM word_links wl JOIN sentences s ON s.id = wl.sentence_id"
            " WHERE wl.ent_seq = ? AND wl.sense_no = ?"
            " ORDER BY wl.is_checked DESC LIMIT ?",
            (ent_seq, sense_no, limit),
        ))
        tiers.append((
            "SELECT s.jp_text, s.en_text, s.segments"
            " FROM word_links wl JOIN sentences s ON s.id = wl.sentence_id"
            " WHERE wl.ent_seq = ?"
            " ORDER BY wl.is_checked DESC LIMIT ?",
            (ent_seq, limit),
        ))

    if headword is not None:
        tiers.append((
            "SELECT s.jp_text, s.en_text, s.segments"
            " FROM word_links wl JOIN sentences s ON s.id = wl.sentence_id"
            " WHERE wl.headword = ? AND wl.sense_no = ?"
            " ORDER BY wl.is_checked DESC LIMIT ?",
            (headword, sense_no, limit),
        ))

    for sql, params in tiers:
        rows = conn.execute(sql, params).fetchall()
        if rows:
            return [
                {
                    "jp": row["jp_text"],
                    "segments": json.loads(row["segments"]),
                    "en": row["en_text"],
                }
                for row in rows
            ]

    return []
