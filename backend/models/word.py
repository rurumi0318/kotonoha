from datetime import datetime
from pydantic import BaseModel

from .furigana import FuriganaSegment


class FsrsData(BaseModel):
    due_date: datetime
    last_review: datetime | None = None
    stability: float = 0.0
    difficulty: float = 0.0
    elapsed_days: int = 0
    scheduled_days: int = 0
    reps: int = 0
    lapses: int = 0
    state: int = 0  # FSRS State: 0=New, 1=Learning, 2=Review, 3=Relearning


class Definition(BaseModel):
    english_definition: str
    sentences: list[FuriganaSegment] = []


class WordData(BaseModel):
    word: FuriganaSegment
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
    definitions: list[DefinitionInput]
    user_notes: str = ""


class WordUpdateRequest(BaseModel):
    word_surface: str | None = None
    definitions: list[DefinitionInput] | None = None
    user_notes: str | None = None
    is_paused: bool | None = None


class OrderRequest(BaseModel):
    order: list[str]
