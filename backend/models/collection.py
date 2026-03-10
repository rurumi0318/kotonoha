from pydantic import BaseModel


class Collection(BaseModel):
    id: str
    name: str
    deck_order: list[str] = []


class CollectionCreateRequest(BaseModel):
    name: str


class CollectionUpdateRequest(BaseModel):
    name: str


class OrderRequest(BaseModel):
    order: list[str]
