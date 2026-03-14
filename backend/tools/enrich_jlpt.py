"""
Enrich JLPT term_meta_bank files with primary POS and definition from jamdict.

Input:  backend/data/jlpt/term_meta_bank_{1..5}.json
        Each element: [word, "freq", {"reading": "...", ...}]

Output: backend/data/jlpt/term_meta_bank_{1..5}_enriched.json
        Each element: {"word": "...", "reading": "...", "pos": "...", "definition": "..."}

Run from the backend/ directory:
    python tools/enrich_jlpt.py
"""

import json
import sys
from pathlib import Path

from jamdict import Jamdict

DATA_DIR = Path(__file__).parent.parent / "data"
JLPT_DIR = DATA_DIR / "jlpt"
DB_PATH = DATA_DIR / "jamdict.db"


def get_primary_sense(jam: Jamdict, word: str, reading: str) -> dict:
    """
    Look up word in jamdict, find the entry whose kana_forms contains
    the given reading, then return the first sense's pos and definition.
    Falls back to first entry if no reading match found.
    """
    result = jam.lookup(word)
    if not result.entries:
        return {"idseq": None, "pos": "", "definition": ""}

    # Find entry matching the reading
    matched = None
    for entry in result.entries:
        kana_forms = [k.text for k in entry.kana_forms]
        if reading in kana_forms:
            matched = entry
            break

    if matched is None:
        matched = result.entries[0]

    idseq = int(matched.idseq)

    # First sense with at least one gloss
    for sense in matched.senses:
        glosses = [g.text for g in sense.gloss]
        if not glosses:
            continue
        pos = list(sense.pos)
        return {
            "idseq": idseq,
            "pos": pos[0] if pos else "",
            "definition": ", ".join(glosses),
        }

    return {"idseq": idseq, "pos": "", "definition": ""}


def process_file(jam: Jamdict, src: Path, dst: Path) -> None:
    raw = json.loads(src.read_text(encoding="utf-8"))
    output = []
    total = len(raw)

    for i, element in enumerate(raw, 1):
        word = element[0]
        reading = element[2].get("reading", "") if isinstance(element[2], dict) else ""
        sense = get_primary_sense(jam, word, reading)
        output.append({
            "word": word,
            "reading": reading,
            "idseq": sense["idseq"],
            "pos": sense["pos"],
            "definition": sense["definition"],
        })
        if i % 50 == 0 or i == total:
            print(f"  {src.name}: {i}/{total}", end="\r", flush=True)

    print()  # newline after progress
    dst.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  -> {dst.name} ({len(output)} entries)")


def main() -> None:
    if not DB_PATH.exists():
        print(f"ERROR: jamdict.db not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    jam = Jamdict(db_file=str(DB_PATH), auto_config=False)

    for n in range(1, 6):
        src = JLPT_DIR / f"term_meta_bank_{n}.json"
        dst = JLPT_DIR / f"term_meta_bank_{n}_enriched.json"
        if not src.exists():
            print(f"Skipping {src.name} (not found)")
            continue
        print(f"Processing {src.name}…")
        process_file(jam, src, dst)

    print("Done.")


if __name__ == "__main__":
    main()
