from fastapi import APIRouter, Depends, HTTPException

from services.auth import get_current_user
from services.vocab_service import lookup

router = APIRouter(prefix="/vocab", tags=["vocab"])


@router.get("/lookup")
async def vocab_lookup(
    q: str,
    uid: str = Depends(get_current_user),
):
    if not q.strip():
        raise HTTPException(status_code=422, detail="Query must not be empty")
    return lookup(q.strip())
