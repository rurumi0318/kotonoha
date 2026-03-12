from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import ArrayRemove, ArrayUnion

from models.word import OrderRequest, WordCreateRequest, WordUpdateRequest
from services.auth import get_current_user
from services.firebase import get_db
from services.fsrs_service import new_fsrs_data
from services.furigana import text_to_furigana_segment

router = APIRouter(
    prefix="/collections/{collection_id}/decks/{deck_id}/words",
    tags=["words"],
)


@router.put("/order")
async def reorder_words(
    collection_id: str,
    deck_id: str,
    body: OrderRequest,
    uid: str = Depends(get_current_user),
):
    deck_ref = _deck_ref(uid, collection_id, deck_id)
    _require_exists(deck_ref, "Deck")
    deck_ref.update({"word_order": body.order})
    return {"word_order": body.order}


@router.get("")
async def list_words(
    collection_id: str,
    deck_id: str,
    uid: str = Depends(get_current_user),
):
    deck_ref = _deck_ref(uid, collection_id, deck_id)
    deck_doc = deck_ref.get()
    _require_exists(deck_doc, "Deck")

    word_order: list[str] = deck_doc.to_dict().get("word_order", [])
    words_snap = {doc.id: doc.to_dict() for doc in deck_ref.collection("words").stream()}

    ordered_ids = dict.fromkeys(word_order)
    result = []
    for wid in ordered_ids:
        if wid in words_snap:
            result.append({"id": wid, **words_snap[wid]})

    seen = set(ordered_ids)
    for wid, data in words_snap.items():
        if wid not in seen:
            result.append({"id": wid, **data})

    return result


@router.post("", status_code=201)
async def create_word(
    collection_id: str,
    deck_id: str,
    body: WordCreateRequest,
    uid: str = Depends(get_current_user),
):
    db = get_db()
    deck_ref = _deck_ref(uid, collection_id, deck_id)
    _require_exists(deck_ref, "Deck")

    # Check for duplicates across all user's decks
    duplicates = _find_duplicates(db, uid, body.word_surface, body.kana_hint)

    # Convert raw Japanese input to FuriganaSegment
    word_segment = text_to_furigana_segment(body.word_surface)
    definitions = _convert_definitions(body.definitions)

    word_ref = deck_ref.collection("words").document()
    word_data = {
        "user_id": uid,
        "collection_id": collection_id,
        "deck_id": deck_id,
        "word": word_segment,
        "kana_hint": body.kana_hint,
        "definitions": definitions,
        "user_notes": body.user_notes,
        "is_paused": False,
        "fsrs_data": new_fsrs_data(),
    }
    word_ref.set(word_data)
    deck_ref.update({"word_order": ArrayUnion([word_ref.id])})

    return {
        "created": {"id": word_ref.id, **word_data},
        "duplicates": duplicates,
    }


@router.patch("/{word_id}")
async def update_word(
    collection_id: str,
    deck_id: str,
    word_id: str,
    body: WordUpdateRequest,
    uid: str = Depends(get_current_user),
):
    word_ref = _word_ref(uid, collection_id, deck_id, word_id)
    _require_exists(word_ref, "Word")

    updates: dict = {}

    if body.word_surface is not None:
        updates["word"] = text_to_furigana_segment(body.word_surface)

    if body.kana_hint is not None:
        updates["kana_hint"] = body.kana_hint

    if body.definitions is not None:
        updates["definitions"] = _convert_definitions(body.definitions)

    if body.user_notes is not None:
        updates["user_notes"] = body.user_notes

    if body.is_paused is not None:
        updates["is_paused"] = body.is_paused

    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    word_ref.update(updates)
    return {"id": word_id, **updates}


@router.delete("/{word_id}", status_code=204)
async def delete_word(
    collection_id: str,
    deck_id: str,
    word_id: str,
    uid: str = Depends(get_current_user),
):
    deck_ref = _deck_ref(uid, collection_id, deck_id)
    word_ref = _word_ref(uid, collection_id, deck_id, word_id)
    _require_exists(word_ref, "Word")

    word_ref.delete()
    deck_ref.update({"word_order": ArrayRemove([word_id])})


# ---------- helpers ----------

def _col_ref(uid: str, collection_id: str):
    return get_db().collection("users").document(uid).collection("collections").document(collection_id)


def _deck_ref(uid: str, collection_id: str, deck_id: str):
    return _col_ref(uid, collection_id).collection("decks").document(deck_id)


def _word_ref(uid: str, collection_id: str, deck_id: str, word_id: str):
    return _deck_ref(uid, collection_id, deck_id).collection("words").document(word_id)


def _require_exists(ref_or_snap, label: str) -> None:
    snap = ref_or_snap if hasattr(ref_or_snap, "exists") else ref_or_snap.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail=f"{label} not found")


def _convert_definitions(definition_inputs) -> list[dict]:
    return [
        {
            "english_definition": d.english_definition,
            "sentences": [
                text_to_furigana_segment(s.surface, en=s.en)
                for s in d.sentences
            ],
        }
        for d in definition_inputs
    ]


def _find_duplicates(db, uid: str, word_surface: str, kana_hint: str) -> list[dict]:
    """
    Query all words for this user with the same surface text and kana_hint.
    Two words are considered duplicates only when both surface and kana_hint
    match — allowing 人気(にんき) and 人気(ひとけ) to coexist without warning.

    Requires a composite Firestore index on: (user_id ASC, word.surface ASC)
    """
    matches = (
        db.collection_group("words")
        .where("user_id", "==", uid)
        .where("word.surface", "==", word_surface)
        .stream()
    )

    duplicates = []
    for doc in matches:
        data = doc.to_dict()
        if data.get("kana_hint", "") != kana_hint:
            continue
        cid = data.get("collection_id", "")
        did = data.get("deck_id", "")

        # Fetch names (2 reads per duplicate — acceptable since duplicates are rare)
        col_snap = db.collection("users").document(uid).collection("collections").document(cid).get()
        deck_snap = (
            db.collection("users").document(uid)
            .collection("collections").document(cid)
            .collection("decks").document(did)
            .get()
        )

        duplicates.append({
            "collection_id": cid,
            "collection_name": col_snap.to_dict().get("name", "") if col_snap.exists else "",
            "deck_id": did,
            "deck_name": deck_snap.to_dict().get("name", "") if deck_snap.exists else "",
        })

    return duplicates
