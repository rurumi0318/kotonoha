"""
Vocabulary lookup: jamdict dictionary entries + linked example sentences,
with async translation of English text.
"""

from jamdict import Jamdict

from services.example_service import get_examples
from services.translator import TranslatorService

_jam: Jamdict | None = None


def _get_jam() -> Jamdict:
    global _jam
    if _jam is None:
        _jam = Jamdict()
    return _jam


async def lookup(text: str, translator: TranslatorService) -> list[dict]:
    """
    Look up a Japanese word and return all matching dictionary entries,
    each with senses and example sentences.  All English strings (gloss,
    example translations) are passed through the translator before returning.

    Returns a list of entries:
    [
      {
        "idseq": 1343460,
        "kanji_forms": ["暑い"],
        "kana_forms": ["あつい"],
        "senses": [
          {
            "sense_no": 1,
            "gloss": ["hot", "warm"],
            "pos": ["adjective (keiyoushi)"],
            "examples": [
              {"jp": "今日は暑い。", "segments": [...], "en": "It's hot today."}
            ]
          }
        ]
      }
    ]
    """
    jam = _get_jam()
    result = jam.lookup(text)

    entries = []
    for entry_idx, entry in enumerate(result.entries):
        kanji_forms = [k.text for k in entry.kanji_forms]
        kana_forms = [k.text for k in entry.kana_forms]
        primary_headword = (kanji_forms[0] if kanji_forms else kana_forms[0]) if (kanji_forms or kana_forms) else None

        # Headword-based lookup (Tier 3) cannot distinguish between entries
        # that share the same kanji form (e.g. 山 = やま and さん). EDRDG
        # indexes sentences by written form only, so '山[01]' always refers
        # to the primary やま meaning. Restrict headword lookup to the first
        # entry; secondary entries rely on ent_seq tiers only.
        headword_for_lookup = primary_headword if entry_idx == 0 else None

        senses = []
        for sense_no, sense in enumerate(entry.senses, start=1):
            examples = get_examples(
                ent_seq=int(entry.idseq),
                headword=headword_for_lookup,
                sense_no=sense_no,
            )
            senses.append({
                "sense_no": sense_no,
                "gloss": [g.text for g in sense.gloss],
                "pos": list(sense.pos),
                "examples": examples,
            })

        entries.append({
            "idseq": int(entry.idseq),
            "kanji_forms": kanji_forms,
            "kana_forms": kana_forms,
            "senses": senses,
        })

    # Collect all English strings for translation
    english_strings: list[str] = []
    # (entry_idx, sense_idx, field, example_idx_or_None)
    positions: list[tuple] = []

    for ei, entry in enumerate(entries):
        for si, sense in enumerate(entry["senses"]):
            for gi, g in enumerate(sense["gloss"]):
                english_strings.append(g)
                positions.append(("gloss", ei, si, gi))
            for xi, ex in enumerate(sense["examples"]):
                english_strings.append(ex["en"])
                positions.append(("example_en", ei, si, xi))

    if english_strings:
        translated = await translator.translate_batch(english_strings)
        for i, pos in enumerate(positions):
            kind = pos[0]
            if kind == "gloss":
                _, ei, si, gi = pos
                entries[ei]["senses"][si]["gloss"][gi] = translated[i]
            elif kind == "example_en":
                _, ei, si, xi = pos
                entries[ei]["senses"][si]["examples"][xi]["en"] = translated[i]

    return entries
