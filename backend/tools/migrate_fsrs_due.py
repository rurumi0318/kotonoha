"""
One-time migration: rename fsrs_data.due_date → due, add new counter fields,
remove card_id.

Run from backend/ directory:
    python -m tools.migrate_fsrs_due
"""

import firebase_admin
from firebase_admin import credentials, firestore


def main():
    if not firebase_admin._apps:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)

    db = firestore.client()
    batch_size = 500
    updated = 0
    skipped = 0

    docs = db.collection_group("words").stream()

    batch = db.batch()
    count = 0

    for doc in docs:
        data = doc.to_dict()
        fsrs = data.get("fsrs_data")
        if not fsrs:
            skipped += 1
            continue

        updates = {}

        # Rename due_date → due
        if "due_date" in fsrs and "due" not in fsrs:
            updates["fsrs_data.due"] = fsrs["due_date"]

        # Remove old fields
        if "due_date" in fsrs:
            updates["fsrs_data.due_date"] = firestore.DELETE_FIELD
        if "card_id" in fsrs:
            updates["fsrs_data.card_id"] = firestore.DELETE_FIELD

        # Add new counter fields with defaults
        if "scheduled_days" not in fsrs:
            updates["fsrs_data.scheduled_days"] = 0
        if "review_count" not in fsrs:
            updates["fsrs_data.review_count"] = 0
        if "lapse_count" not in fsrs:
            updates["fsrs_data.lapse_count"] = 0

        if not updates:
            skipped += 1
            continue

        batch.update(doc.reference, updates)
        count += 1
        updated += 1

        if count >= batch_size:
            batch.commit()
            print(f"  committed {updated} docs so far...")
            batch = db.batch()
            count = 0

    if count > 0:
        batch.commit()

    print(f"Migration complete. Updated: {updated}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
