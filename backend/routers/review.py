from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from models.word import ReviewDueResponse, ReviewRequest, ReviewWordItem
from services.auth import get_current_user
from services.firebase import get_db
from services.fsrs_service import process_review

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/due", response_model=ReviewDueResponse)
async def get_due_words(
    collection_id: str | None = Query(None),
    deck_ids: str | None = Query(None),
    early: bool = Query(False),
    uid: str = Depends(get_current_user),
):
    """
    Return due words for review, with optional filtering and batching.

    Query params:
        collection_id: filter to one collection
        deck_ids: comma-separated deck IDs (requires collection_id), max 30
        early: if true, include words not yet due
    """
    if deck_ids and not collection_id:
        raise HTTPException(
            status_code=422,
            detail="deck_ids requires collection_id",
        )

    db = get_db()
    now = datetime.now(timezone.utc)

    # Read batch size from user preferences
    batch_size = 20
    user_doc = db.collection("users").document(uid).get()
    if user_doc.exists:
        prefs = user_doc.to_dict().get("preferences", {})
        batch_size = prefs.get("daily_review_limit", 20)

    # Parse deck_ids
    deck_id_list: list[str] | None = None
    if deck_ids:
        deck_id_list = [d.strip() for d in deck_ids.split(",") if d.strip()]
        if len(deck_id_list) > 30:
            raise HTTPException(
                status_code=422,
                detail="Maximum 30 deck_ids allowed",
            )

    # Build query
    query = (
        db.collection_group("words")
        .where("user_id", "==", uid)
        .where("is_paused", "==", False)
    )

    if collection_id:
        query = query.where("collection_id", "==", collection_id)

    if deck_id_list:
        query = query.where("deck_id", "in", deck_id_list)

    if not early:
        query = query.where("fsrs_data.due", "<=", now)

    query = query.order_by("fsrs_data.due").limit(batch_size)

    docs = list(query.stream())

    # Look up collection/deck names with in-request cache
    name_cache: dict[str, str] = {}
    words: list[ReviewWordItem] = []

    for doc in docs:
        data = doc.to_dict()
        cid = data["collection_id"]
        did = data["deck_id"]

        col_name = _resolve_name(db, uid, name_cache, "col", cid)
        deck_name = _resolve_name(db, uid, name_cache, "deck", f"{cid}/{did}", cid, did)

        words.append(ReviewWordItem(
            id=doc.id,
            word=data["word"],
            kana_hint=data.get("kana_hint", ""),
            definitions=data.get("definitions", []),
            user_notes=data.get("user_notes", ""),
            collection_id=cid,
            deck_id=did,
            collection_name=col_name,
            deck_name=deck_name,
            fsrs_data=data["fsrs_data"],
        ))

    # If no words found and not early review, find next_due
    next_due = None
    if not words and not early:
        next_query = (
            db.collection_group("words")
            .where("user_id", "==", uid)
            .where("is_paused", "==", False)
        )
        if collection_id:
            next_query = next_query.where("collection_id", "==", collection_id)
        if deck_id_list:
            next_query = next_query.where("deck_id", "in", deck_id_list)

        next_query = next_query.order_by("fsrs_data.due").limit(1)
        next_docs = list(next_query.stream())
        if next_docs:
            next_data = next_docs[0].to_dict()
            next_due = next_data.get("fsrs_data", {}).get("due")

    return ReviewDueResponse(
        words=words,
        next_due=next_due,
        is_early=early,
    )


@router.post(
    "/collections/{collection_id}/decks/{deck_id}/words/{word_id}",
)
async def submit_review(
    collection_id: str,
    deck_id: str,
    word_id: str,
    body: ReviewRequest,
    uid: str = Depends(get_current_user),
):
    """Submit a review rating for a word and update its FSRS schedule."""
    db = get_db()
    word_ref = (
        db.collection("users").document(uid)
        .collection("collections").document(collection_id)
        .collection("decks").document(deck_id)
        .collection("words").document(word_id)
    )

    word_doc = word_ref.get()
    if not word_doc.exists:
        raise HTTPException(status_code=404, detail="Word not found")

    word_data = word_doc.to_dict()
    if word_data.get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")

    updated_fsrs = process_review(word_data["fsrs_data"], body.rating)
    word_ref.update({"fsrs_data": updated_fsrs})

    return {"id": word_id, "fsrs_data": updated_fsrs}


def _resolve_name(
    db, uid: str, cache: dict, kind: str, cache_key: str,
    collection_id: str | None = None, deck_id: str | None = None,
) -> str:
    if cache_key in cache:
        return cache[cache_key]

    name = ""
    user_ref = db.collection("users").document(uid)

    if kind == "col":
        snap = user_ref.collection("collections").document(cache_key).get()
        if snap.exists:
            name = snap.to_dict().get("name", "")
    elif kind == "deck" and collection_id and deck_id:
        snap = (
            user_ref.collection("collections").document(collection_id)
            .collection("decks").document(deck_id).get()
        )
        if snap.exists:
            name = snap.to_dict().get("name", "")

    cache[cache_key] = name
    return name
