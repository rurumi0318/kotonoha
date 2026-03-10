from fastapi import APIRouter, Depends

from models.user import UserPreferences
from services.auth import get_current_user
from services.firebase import get_db

router = APIRouter(prefix="/preferences", tags=["preferences"])

_DEFAULTS = UserPreferences().model_dump()


@router.get("")
async def get_preferences(uid: str = Depends(get_current_user)):
    db = get_db()
    user_doc = db.collection("users").document(uid).get()

    if not user_doc.exists:
        return _DEFAULTS

    stored = user_doc.to_dict().get("preferences", {})
    # Merge with defaults so new preference fields are always present
    return {**_DEFAULTS, **stored}


@router.put("")
async def update_preferences(
    body: UserPreferences,
    uid: str = Depends(get_current_user),
):
    db = get_db()
    db.collection("users").document(uid).set(
        {"preferences": body.model_dump()}, merge=True
    )
    return body.model_dump()
