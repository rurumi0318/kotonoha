"""
Converts raw Japanese text into a FuriganaSegment dict.

Pipeline:
  raw text → SudachiPy (sudachidict_full) tokenization
           → per-token furigana alignment (lookahead okurigana matching)
           → FuriganaSegment
"""

import re

import jaconv
from sudachipy import dictionary, tokenizer

_tokenizer_obj = None

# Matches any CJK unified ideograph (kanji) plus iteration marks
_KANJI_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3005-\u3007]")
_HIRA_RE = re.compile(r"[ぁ-ん]")


def _get_tokenizer():
    global _tokenizer_obj
    if _tokenizer_obj is None:
        _tokenizer_obj = dictionary.Dictionary(dict="full").create()
    return _tokenizer_obj


def _has_kanji(text: str) -> bool:
    return bool(_KANJI_RE.search(text))


def _align_reading(surface: str, reading: str) -> list[dict]:
    """
    Align a hiragana reading string to the surface characters of a token.

    Uses lookahead okurigana matching to correctly handle:
      - repeated kana:         可愛い  → 可愛[かわい]  + い
      - interleaved kana/kanji: 辿り着く → 辿[たど] + り + 着[つ] + く
      - long okurigana:        教える  → 教[おし]  + える
    """
    segments: list[dict] = []
    s_idx = 0
    r_idx = 0

    while s_idx < len(surface):
        ch = surface[s_idx]

        if _KANJI_RE.match(ch):
            # Collect the full contiguous kanji block
            kanji_end = s_idx
            while kanji_end < len(surface) and _KANJI_RE.match(surface[kanji_end]):
                kanji_end += 1
            kanji_block = surface[s_idx:kanji_end]

            # Collect the following okurigana (hiragana after the kanji block)
            oku_end = kanji_end
            while oku_end < len(surface) and _HIRA_RE.match(surface[oku_end]):
                oku_end += 1
            okurigana = surface[kanji_end:oku_end]

            if not okurigana:
                # No okurigana: consume all remaining reading
                segments.append({"t": kanji_block, "r": reading[r_idx:]})
                r_idx = len(reading)
            else:
                # Search for okurigana in remaining reading with lookahead.
                # Iterate all occurrences and keep the LAST valid match, so
                # that repeated kana (e.g. 可愛い reading かわいい) are handled
                # correctly: we assign かわい to 可愛, not just かわ.
                search_start = r_idx
                match_pos = len(reading)  # fallback
                while search_start < len(reading):
                    idx = reading.find(okurigana, search_start)
                    if idx == -1:
                        break
                    after_reading = reading[idx + len(okurigana):]
                    after_surface = surface[oku_end:]
                    if not after_surface or after_reading:
                        match_pos = idx  # keep updating to prefer the last valid match
                    search_start = idx + 1

                segments.append({"t": kanji_block, "r": reading[r_idx:match_pos]})
                r_idx = match_pos

            s_idx = kanji_end

        else:
            # Kana or other character — emit as-is, advance reading pointer if it matches
            segments.append({"t": ch})
            if _HIRA_RE.match(ch) and r_idx < len(reading) and reading[r_idx] == ch:
                r_idx += 1
            s_idx += 1

    return segments


def text_to_furigana_segment(surface: str, en: str | None = None) -> dict:
    """
    Convert raw Japanese text to a FuriganaSegment dict ready for Firestore.

    Args:
        surface: raw Japanese text (word or sentence)
        en:      optional English translation

    Returns:
        dict with keys: surface, segments, (en if provided)
    """
    tok = _get_tokenizer()
    segments: list[dict] = []

    for token in tok.tokenize(surface, tokenizer.Tokenizer.SplitMode.C):
        token_surface: str = token.surface()
        reading_hira: str = jaconv.kata2hira(token.reading_form())

        if not _has_kanji(token_surface) or token_surface == reading_hira:
            # Pure kana / punctuation — no annotation needed
            segments.append({"t": token_surface})
        else:
            segments.extend(_align_reading(token_surface, reading_hira))

    result: dict = {"surface": surface, "segments": segments}
    if en is not None:
        result["en"] = en
    return result
