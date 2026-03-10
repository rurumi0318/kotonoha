from pydantic import BaseModel


class Deck(BaseModel):
    id: str
    name: str
    tag: str = ""
    word_order: list[str] = []


class DeckCreateRequest(BaseModel):
    name: str
    tag: str = ""


class DeckUpdateRequest(BaseModel):
    name: str | None = None
    tag: str | None = None


class OrderRequest(BaseModel):
    order: list[str]
