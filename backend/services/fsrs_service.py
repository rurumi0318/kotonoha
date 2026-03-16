"""
Thin wrapper around fsrs (v6) for scheduling reviews.
"""

from datetime import datetime, timezone

from fsrs import Card, Rating, Scheduler, State

_scheduler = Scheduler()

_RATING_MAP = {
    1: Rating.Again,
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
        rating:    1=Again, 3=Good, 4=Easy
    """
    if rating not in _RATING_MAP:
        raise ValueError(f"Invalid rating {rating}. Must be 1, 3, or 4.")

    prev_state = fsrs_data.get("state", 1)
    review_count = fsrs_data.get("review_count", 0)
    lapse_count = fsrs_data.get("lapse_count", 0)

    card = _dict_to_card(fsrs_data)
    updated_card, _ = _scheduler.review_card(card, _RATING_MAP[rating])
    result = _card_to_dict(updated_card)

    # Compute scheduled_days from the new interval
    if updated_card.last_review:
        result["scheduled_days"] = max(0, (updated_card.due - updated_card.last_review).days)
    else:
        result["scheduled_days"] = 0

    result["review_count"] = review_count + 1

    # Lapse: rating=Again while previously in Review state
    if rating == 1 and prev_state == 2:
        result["lapse_count"] = lapse_count + 1
    else:
        result["lapse_count"] = lapse_count

    return result


def _dict_to_card(data: dict) -> Card:
    # Backward-compatible: read `due` first, fall back to `due_date`
    due_val = data.get("due") or data.get("due_date") or datetime.now(timezone.utc)
    return Card(
        card_id=int(datetime.now(timezone.utc).timestamp() * 1000),
        state=State(data.get("state", 1)),
        step=data.get("step"),
        stability=data.get("stability"),
        difficulty=data.get("difficulty"),
        due=_ensure_tz(due_val),
        last_review=_ensure_tz(data["last_review"]) if data.get("last_review") else None,
    )


def _card_to_dict(card: Card) -> dict:
    return {
        "due": card.due,
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
