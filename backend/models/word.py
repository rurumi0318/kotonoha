from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from .furigana import FuriganaSegment


class FsrsData(BaseModel):
    due: datetime
    last_review: datetime | None = None
    stability: float | None = None
    difficulty: float | None = None
    step: int | None = None
    state: int = 1  # FSRS State: 1=Learning, 2=Review, 3=Relearning
    scheduled_days: int = 0
    review_count: int = 0
    lapse_count: int = 0


class Definition(BaseModel):
    english_definition: str
    sentences: list[FuriganaSegment] = []


class WordData(BaseModel):
    word: FuriganaSegment
    kana_hint: str = ""
    definitions: list[Definition]
    user_notes: str = ""
    is_paused: bool = False
    fsrs_data: FsrsData
    # Denormalized for collection group queries
    user_id: str
    collection_id: str
    deck_id: str


# ---------- Request bodies (raw input from client) ----------

class SentenceInput(BaseModel):
    surface: str  # raw Japanese
    en: str       # English translation


class DefinitionInput(BaseModel):
    english_definition: str
    sentences: list[SentenceInput] = []


class WordCreateRequest(BaseModel):
    word_surface: str
    kana_hint: str = ""
    definitions: list[DefinitionInput]
    user_notes: str = ""


class WordUpdateRequest(BaseModel):
    word_surface: str | None = None
    kana_hint: str | None = None
    definitions: list[DefinitionInput] | None = None
    user_notes: str | None = None
    is_paused: bool | None = None


class OrderRequest(BaseModel):
    order: list[str]


# ---------- Review models ----------

class ReviewRequest(BaseModel):
    rating: Literal[1, 2, 3, 4]  # Again=1, Hard=2, Good=3, Easy=4


class ReviewWordItem(BaseModel):
    id: str
    word: FuriganaSegment
    kana_hint: str
    definitions: list[Definition]
    user_notes: str
    collection_id: str
    deck_id: str
    collection_name: str
    deck_name: str
    fsrs_data: FsrsData


class ReviewDueResponse(BaseModel):
    words: list[ReviewWordItem]
    next_due: datetime | None = None
    is_early: bool = False
