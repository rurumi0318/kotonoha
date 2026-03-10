from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import ArrayRemove, ArrayUnion

from models.collection import (
    CollectionCreateRequest,
    CollectionUpdateRequest,
    OrderRequest,
)
from services.auth import get_current_user
from services.firebase import get_db

router = APIRouter(prefix="/collections", tags=["collections"])


# PUT /collections/order must be defined BEFORE /{collection_id} routes
# so FastAPI doesn't treat "order" as a collection ID.

@router.put("/order")
async def reorder_collections(
    body: OrderRequest,
    uid: str = Depends(get_current_user),
):
    db = get_db()
    db.collection("users").document(uid).set(
        {"collection_order": body.order}, merge=True
    )
    return {"collection_order": body.order}


@router.get("")
async def list_collections(uid: str = Depends(get_current_user)):
    db = get_db()
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()

    collection_order: list[str] = []
    if user_doc.exists:
        collection_order = user_doc.to_dict().get("collection_order", [])

    cols_snap = {doc.id: doc.to_dict() for doc in user_ref.collection("collections").stream()}

    # Return in user-defined order; append any orphaned docs at the end
    ordered_ids = dict.fromkeys(collection_order)  # preserves insertion order, deduplicates
    result = []
    for cid in ordered_ids:
        if cid in cols_snap:
            result.append({"id": cid, **cols_snap[cid]})

    seen = set(ordered_ids)
    for cid, data in cols_snap.items():
        if cid not in seen:
            result.append({"id": cid, **data})

    return result


@router.post("", status_code=201)
async def create_collection(
    body: CollectionCreateRequest,
    uid: str = Depends(get_current_user),
):
    db = get_db()
    user_ref = db.collection("users").document(uid)
    col_ref = user_ref.collection("collections").document()

    data = {"name": body.name, "deck_order": []}
    col_ref.set(data)

    # Append new ID to order list; create user doc if it doesn't exist yet
    user_ref.set({"collection_order": ArrayUnion([col_ref.id])}, merge=True)

    return {"id": col_ref.id, **data}


@router.patch("/{collection_id}")
async def update_collection(
    collection_id: str,
    body: CollectionUpdateRequest,
    uid: str = Depends(get_current_user),
):
    db = get_db()
    col_ref = (
        db.collection("users").document(uid).collection("collections").document(collection_id)
    )

    if not col_ref.get().exists:
        raise HTTPException(status_code=404, detail="Collection not found")

    col_ref.update({"name": body.name})
    return {"id": collection_id, "name": body.name}


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: str,
    uid: str = Depends(get_current_user),
):
    db = get_db()
    user_ref = db.collection("users").document(uid)
    col_ref = user_ref.collection("collections").document(collection_id)

    if not col_ref.get().exists:
        raise HTTPException(status_code=404, detail="Collection not found")

    _delete_collection_cascade(col_ref)

    user_ref.update({"collection_order": ArrayRemove([collection_id])})


def _delete_collection_cascade(col_ref) -> None:
    """Delete a collection and all its decks and words."""
    for deck_doc in col_ref.collection("decks").stream():
        for word_doc in deck_doc.reference.collection("words").stream():
            word_doc.reference.delete()
        deck_doc.reference.delete()
    col_ref.delete()
