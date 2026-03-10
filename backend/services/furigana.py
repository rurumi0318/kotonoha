"""
Converts raw Japanese text into a FuriganaSegment dict.

Pipeline:
  raw text → MeCab (fugashi + ipadic) tokenization
           → per-token furigana alignment
           → FuriganaSegment
"""

import os
import re

import fugashi
import ipadic

_tagger: fugashi.Tagger | None = None
_DEVNULL = "NUL" if os.name == "nt" else "/dev/null"

# Matches any CJK unified ideograph (kanji)
_KANJI_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]")


def _get_tagger() -> fugashi.Tagger:
    global _tagger
    if _tagger is None:
        # Use ipadic dictionary; skip system mecabrc with -r /dev/null
        _tagger = fugashi.Tagger(f"-d {ipadic.DICDIR} -r {_DEVNULL}")
    return _tagger


def _has_kanji(text: str) -> bool:
    return bool(_KANJI_RE.search(text))


def _kata_to_hira(text: str) -> str:
    """Convert katakana characters to hiragana."""
    return "".join(
        chr(ord(c) - 0x60) if "ァ" <= c <= "ン" else c
        for c in text
    )


def _split_token_segments(surface: str, reading_hira: str) -> list[dict]:
    """
    Align a MeCab token (possibly mixed kanji/kana) to furigana segments.

    Example:
      surface="重い", reading_hira="おもい"
      → [{"t": "重", "r": "おも"}, {"t": "い"}]
    """
    if not _has_kanji(surface):
        return [{"t": surface}]

    # Split surface into alternating kanji / non-kanji runs.
    # The capturing group keeps the kanji parts in the result list.
    parts = re.split(r"([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+)", surface)

    remaining = reading_hira
    result: list[dict] = []
    i = 0

    while i < len(parts):
        part = parts[i]

        if not part:
            i += 1
            continue

        if _has_kanji(part):
            next_kana = parts[i + 1] if i + 1 < len(parts) else ""

            if not next_kana:
                # Kanji run at end of surface — consume all remaining reading
                result.append({"t": part, "r": remaining})
                remaining = ""
            else:
                idx = remaining.find(next_kana)
                if idx == -1:
                    # Alignment failed — fall back to one segment for the whole token
                    return [{"t": surface, "r": reading_hira}]
                result.append({"t": part, "r": remaining[:idx]})
                remaining = remaining[idx:]
        else:
            # Non-kanji run: no reading needed, consume same length from remaining
            result.append({"t": part})
            remaining = remaining[len(part):]

        i += 1

    return result


def text_to_furigana_segment(surface: str, en: str | None = None) -> dict:
    """
    Convert raw Japanese text to a FuriganaSegment dict ready for Firestore.

    Args:
        surface: raw Japanese text (word or sentence)
        en:      optional English translation

    Returns:
        dict with keys: surface, segments, (en if provided)
    """
    tagger = _get_tagger()
    segments: list[dict] = []

    for token in tagger(surface):
        token_surface: str = token.surface

        # ipadic feature index 7 = reading in katakana; '*' if unknown
        try:
            reading_kata = token.feature[7]
            reading_hira = _kata_to_hira(reading_kata) if reading_kata != "*" else None
        except (IndexError, TypeError):
            reading_hira = None

        if reading_hira:
            token_segments = _split_token_segments(token_surface, reading_hira)
        else:
            token_segments = [{"t": token_surface}]

        segments.extend(token_segments)

    result: dict = {"surface": surface, "segments": segments}
    if en is not None:
        result["en"] = en
    return result
