from pydantic import BaseModel


class FuriganaToken(BaseModel):
    t: str
    r: str | None = None  # hiragana reading; omitted for kana-only tokens


class FuriganaSegment(BaseModel):
    surface: str               # original raw text
    segments: list[FuriganaToken]
    en: str | None = None      # English translation (used for sentences)
