import os
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from services.audio_cache import get_audio_cache
from services.auth import get_current_user
from services.tts_service import cache_key, get_tts_provider

router = APIRouter(prefix='/tts', tags=['tts'])

# Simple in-memory rate limiter: uid → list of request timestamps
_rate_limit: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 60   # max requests
_RATE_WINDOW = 60  # per seconds


def _check_rate_limit(uid: str) -> None:
    now = time.time()
    cutoff = now - _RATE_WINDOW
    _rate_limit[uid] = [t for t in _rate_limit[uid] if t > cutoff]
    if len(_rate_limit[uid]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail='Rate limit exceeded')
    _rate_limit[uid].append(now)


@router.get('/audio')
async def get_audio(
    text: str = Query(..., max_length=500),
    voice: str | None = Query(None, max_length=100),
    uid: str = Depends(get_current_user),
) -> Response:
    if not text.strip():
        raise HTTPException(status_code=400, detail='text is required')

    _check_rate_limit(uid)

    voice_name = voice or os.environ.get('TTS_VOICE_NAME', 'ja-JP-Chirp3-HD-Leda')
    key = cache_key(voice_name, text)
    cache = get_audio_cache()

    audio_bytes = cache.get_bytes(key)
    if audio_bytes is None:
        audio_bytes = get_tts_provider().synthesize(text, voice_name)
        cache.put(key, audio_bytes)

    return Response(
        content=audio_bytes,
        media_type='audio/mpeg',
        headers={'Cache-Control': 'public, max-age=86400'},
    )
