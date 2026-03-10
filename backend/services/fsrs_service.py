"""
Thin wrapper around fsrs (v6) for scheduling reviews.
"""

from datetime import datetime, timezone

from fsrs import Card, Rating, Scheduler, State

_scheduler = Scheduler()

_RATING_MAP = {
    1: Rating.Again,
    2: Rating.Hard,
    3: Rating.Good,
    4: Rating.Easy,
}


def new_fsrs_data() -> dict:
    """Return fsrs_data for a brand-new word."""
    return _card_to_dict(Card())


def process_review(fsrs_data: dict, rating: int) -> dict:
    """
    Apply a review rating to existing fsrs_data and return the updated dict.

    Args:
        fsrs_data: current fsrs_data dict stored in Firestore
        rating:    1=Again, 2=Hard, 3=Good, 4=Easy
    """
    if rating not in _RATING_MAP:
        raise ValueError(f"Invalid rating {rating}. Must be 1–4.")

    card = _dict_to_card(fsrs_data)
    updated_card, _ = _scheduler.review_card(card, _RATING_MAP[rating])
    return _card_to_dict(updated_card)


def _dict_to_card(data: dict) -> Card:
    return Card(
        card_id=data.get("card_id", int(datetime.now(timezone.utc).timestamp() * 1000)),
        state=State(data.get("state", 1)),
        step=data.get("step"),
        stability=data.get("stability"),
        difficulty=data.get("difficulty"),
        due=_ensure_tz(data.get("due_date", datetime.now(timezone.utc))),
        last_review=_ensure_tz(data["last_review"]) if data.get("last_review") else None,
    )


def _card_to_dict(card: Card) -> dict:
    return {
        "card_id": card.card_id,
        "due_date": card.due,
        "last_review": card.last_review,
        "stability": card.stability,
        "difficulty": card.difficulty,
        "step": card.step,
        "state": card.state.value,
    }


def _ensure_tz(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
