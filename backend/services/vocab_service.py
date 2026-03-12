"""
Vocabulary lookup: jamdict dictionary entries + linked example sentences.
"""

from jamdict import Jamdict

from services.example_service import get_examples

_jam: Jamdict | None = None


def _get_jam() -> Jamdict:
    global _jam
    if _jam is None:
        _jam = Jamdict()
    return _jam


def lookup(text: str) -> list[dict]:
    """
    Look up a Japanese word and return all matching dictionary entries,
    each with senses and example sentences.

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
    for entry in result.entries:
        kanji_forms = [k.text for k in entry.kanji_forms]
        kana_forms = [k.text for k in entry.kana_forms]
        primary_headword = (kanji_forms[0] if kanji_forms else kana_forms[0]) if (kanji_forms or kana_forms) else None

        senses = []
        for sense_no, sense in enumerate(entry.senses, start=1):
            examples = get_examples(
                ent_seq=int(entry.idseq),
                headword=primary_headword,
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

    return entries
