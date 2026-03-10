"""
Thin wrapper around py-fsrs for scheduling reviews.
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
        due=_ensure_tz(data.get("due_date", datetime.now(timezone.utc))),
        last_review=_ensure_tz(data["last_review"]) if data.get("last_review") else None,
        stability=data.get("stability", 0.0),
        difficulty=data.get("difficulty", 0.0),
        elapsed_days=data.get("elapsed_days", 0),
        scheduled_days=data.get("scheduled_days", 0),
        reps=data.get("reps", 0),
        lapses=data.get("lapses", 0),
        state=State(data.get("state", 0)),
    )


def _card_to_dict(card: Card) -> dict:
    return {
        "due_date": card.due,
        "last_review": card.last_review,
        "stability": card.stability,
        "difficulty": card.difficulty,
        "elapsed_days": card.elapsed_days,
        "scheduled_days": card.scheduled_days,
        "reps": card.reps,
        "lapses": card.lapses,
        "state": card.state.value,
    }


def _ensure_tz(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
