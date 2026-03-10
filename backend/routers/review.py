from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth import get_current_user
from services.firebase import get_db
from services.fsrs_service import process_review

router = APIRouter(prefix="/review", tags=["review"])


class ReviewRequest(BaseModel):
    rating: int  # 1=Again, 2=Hard, 3=Good, 4=Easy


@router.get("/due")
async def get_due_words(uid: str = Depends(get_current_user)):
    """
    Return all non-paused words whose due_date has passed.

    Requires a composite Firestore index on:
      (user_id ASC, is_paused ASC, fsrs_data.due_date ASC)
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    docs = (
        db.collection_group("words")
        .where("user_id", "==", uid)
        .where("is_paused", "==", False)
        .where("fsrs_data.due_date", "<=", now)
        .stream()
    )

    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


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

    try:
        updated_fsrs = process_review(word_data["fsrs_data"], body.rating)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    word_ref.update({"fsrs_data": updated_fsrs})

    return {"id": word_id, "fsrs_data": updated_fsrs}
