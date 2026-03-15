"""
Quick-add vocabulary sets: list available sets and bulk-import into a collection.

POST /collections/{collection_id}/quickadd
  { "set_id": "jlpt_n5" }

Creates decks of 20 words each using pre-built data from quickadd.db.
No MeCab, no jamdict, no duplicate checking at request time — all data is
pre-computed by tools/build_quickadd_db.py.
"""

import math

from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import ArrayUnion
from pydantic import BaseModel

from services.auth import get_current_user
from services.firebase import get_db
from services.fsrs_service import new_fsrs_data
from services.quickadd_service import get_vocab_sets, get_words

WORDS_PER_DECK = 20

router = APIRouter(tags=["quickadd"])


class QuickAddRequest(BaseModel):
    set_id: str


@router.get("/quickadd/sets")
async def list_vocab_sets():
    """Return all available vocabulary sets (drives the frontend buttons)."""
    try:
        return get_vocab_sets()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/collections/{collection_id}/quickadd", status_code=201)
async def quickadd_to_collection(
    collection_id: str,
    body: QuickAddRequest,
    uid: str = Depends(get_current_user),
):
    db = get_db()
    col_ref = db.collection("users").document(uid).collection("collections").document(collection_id)

    if not col_ref.get().exists:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Load pre-built word data
    try:
        sets = {s["set_id"]: s for s in get_vocab_sets()}
        if body.set_id not in sets:
            raise HTTPException(status_code=404, detail=f"Vocab set '{body.set_id}' not found")
        words = get_words(body.set_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    if not words:
        raise HTTPException(status_code=404, detail=f"Vocab set '{body.set_id}' has no words")

    display_name = sets[body.set_id]["display_name"]
    chunks = _chunk(words, WORDS_PER_DECK)
    total_decks = len(chunks)
    pad_width = len(str(total_decks))

    new_deck_ids: list[str] = []

    for deck_idx, chunk in enumerate(chunks, start=1):
        deck_name = f"{display_name}, {str(deck_idx).zfill(max(pad_width, 3))}"

        # Pre-allocate all document refs so word_order is known before writing
        deck_ref = col_ref.collection("decks").document()
        word_refs = [deck_ref.collection("words").document() for _ in chunk]
        word_ids = [r.id for r in word_refs]

        batch = db.batch()

        batch.set(deck_ref, {
            "name": deck_name,
            "tag": display_name,
            "word_order": word_ids,
        })

        for word_ref, w in zip(word_refs, chunk):
            definitions = []
            if w["definition"] or w["sent_furigana"]:
                sentence = [w["sent_furigana"]] if w["sent_furigana"] else []
                definitions.append({
                    "english_definition": w["definition"],
                    "sentences": sentence,
                })

            batch.set(word_ref, {
                "user_id":       uid,
                "collection_id": collection_id,
                "deck_id":       deck_ref.id,
                "word":          w["word_furigana"],
                "kana_hint":     w["reading"],
                "definitions":   definitions,
                "user_notes":    "",
                "is_paused":     False,
                "fsrs_data":     new_fsrs_data(),
            })

        batch.commit()
        new_deck_ids.append(deck_ref.id)

    # Append all new decks to the collection order in one write
    col_ref.update({"deck_order": ArrayUnion(new_deck_ids)})

    return {
        "decks_created": len(new_deck_ids),
        "words_created": len(words),
    }


def _chunk(lst: list, size: int) -> list[list]:
    return [lst[i:i + size] for i in range(0, len(lst), size)]
