from pydantic import BaseModel


class Collection(BaseModel):
    id: str
    name: str
    desc: str = ""
    deck_order: list[str] = []


class CollectionCreateRequest(BaseModel):
    name: str
    desc: str = ""


class CollectionUpdateRequest(BaseModel):
    name: str
    desc: str = ""


class OrderRequest(BaseModel):
    order: list[str]
