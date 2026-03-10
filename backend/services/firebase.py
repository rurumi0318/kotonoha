import firebase_admin
from firebase_admin import firestore

_app: firebase_admin.App | None = None


def init_firebase() -> None:
    global _app
    if _app is not None:
        return
    # On Cloud Run, uses Application Default Credentials automatically.
    # For local dev, set GOOGLE_APPLICATION_CREDENTIALS env var.
    _app = firebase_admin.initialize_app()


def get_db():
    return firestore.client()
