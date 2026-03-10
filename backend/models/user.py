from pydantic import BaseModel


class UserPreferences(BaseModel):
    daily_review_limit: int = 20
    new_words_per_day: int = 10
