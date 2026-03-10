from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import ArrayRemove, ArrayUnion

from models.deck import DeckCreateRequest, DeckUpdateRequest, OrderRequest
from services.auth import get_current_user
from services.firebase import get_db

router = APIRouter(
    prefix="/collections/{collection_id}/decks",
    tags=["decks"],
)


@router.put("/order")
async def reorder_decks(
    collection_id: str,
    body: OrderRequest,
    uid: str = Depends(get_current_user),
):
    col_ref = _col_ref(uid, collection_id)
    _require_exists(col_ref, "Collection")

    col_ref.update({"deck_order": body.order})
    return {"deck_order": body.order}


@router.get("")
async def list_decks(
    collection_id: str,
    uid: str = Depends(get_current_user),
):
    col_ref = _col_ref(uid, collection_id)
    col_doc = col_ref.get()
    _require_exists(col_doc, "Collection")

    deck_order: list[str] = col_doc.to_dict().get("deck_order", [])
    decks_snap = {doc.id: doc.to_dict() for doc in col_ref.collection("decks").stream()}

    ordered_ids = dict.fromkeys(deck_order)
    result = []
    for did in ordered_ids:
        if did in decks_snap:
            result.append({"id": did, **decks_snap[did]})

    seen = set(ordered_ids)
    for did, data in decks_snap.items():
        if did not in seen:
            result.append({"id": did, **data})

    return result


@router.post("", status_code=201)
async def create_deck(
    collection_id: str,
    body: DeckCreateRequest,
    uid: str = Depends(get_current_user),
):
    col_ref = _col_ref(uid, collection_id)
    _require_exists(col_ref, "Collection")

    deck_ref = col_ref.collection("decks").document()
    data = {"name": body.name, "tag": body.tag, "word_order": []}
    deck_ref.set(data)

    col_ref.update({"deck_order": ArrayUnion([deck_ref.id])})

    return {"id": deck_ref.id, **data}


@router.patch("/{deck_id}")
async def update_deck(
    collection_id: str,
    deck_id: str,
    body: DeckUpdateRequest,
    uid: str = Depends(get_current_user),
):
    deck_ref = _deck_ref(uid, collection_id, deck_id)
    _require_exists(deck_ref, "Deck")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    deck_ref.update(updates)
    return {"id": deck_id, **updates}


@router.delete("/{deck_id}", status_code=204)
async def delete_deck(
    collection_id: str,
    deck_id: str,
    uid: str = Depends(get_current_user),
):
    col_ref = _col_ref(uid, collection_id)
    deck_ref = _deck_ref(uid, collection_id, deck_id)
    _require_exists(deck_ref, "Deck")

    for word_doc in deck_ref.collection("words").stream():
        word_doc.reference.delete()
    deck_ref.delete()

    col_ref.update({"deck_order": ArrayRemove([deck_id])})


# ---------- helpers ----------

def _col_ref(uid: str, collection_id: str):
    return get_db().collection("users").document(uid).collection("collections").document(collection_id)


def _deck_ref(uid: str, collection_id: str, deck_id: str):
    return _col_ref(uid, collection_id).collection("decks").document(deck_id)


def _require_exists(ref_or_snap, label: str) -> None:
    """Accept either a DocumentReference or a DocumentSnapshot."""
    snap = ref_or_snap if hasattr(ref_or_snap, "exists") else ref_or_snap.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail=f"{label} not found")
