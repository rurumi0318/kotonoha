# Infrastructure Overview

## Cloud Architecture

| Service | Provider | Purpose |
|---|---|---|
| Frontend Hosting | Firebase Hosting | Global CDN for static assets |
| Backend API | Google Cloud Run | Serverless container, auto-scales to zero |
| Database | Google Cloud Firestore | NoSQL document database |
| Authentication | Firebase Authentication | Google Login (OAuth 2.0) |
| Container Registry | Artifact Registry | Stores Docker images for the backend |

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, Docker
- **Frontend:** HTML / CSS / JavaScript
- **API Protocol:** RESTful JSON
- **Auth:** Firebase JWT — verified on every backend request

## Directory Structure

```
/
├── firebase.json              # Firebase project config (hosting + firestore)
├── firestore.indexes.json     # Composite Firestore indexes
├── firestore.rules            # Firestore security rules
├── frontend/
│   └── public/                # Static files deployed to Firebase Hosting
│       └── index.html
└── backend/                   # FastAPI app deployed to Cloud Run
    ├── main.py
    ├── Dockerfile
    ├── requirements.txt
    ├── models/
    ├── routers/
    └── services/
```

See [backend/README.md](./backend/README.md) for backend design details.

## Deployment

### Firestore indexes
```bash
# Run from project root
firebase deploy --only firestore:indexes
```

### Backend (Cloud Run)
```bash
cd backend
gcloud run deploy project-kotonoha --source . --region asia-east1 --allow-unauthenticated
```

### Frontend (Firebase Hosting)
```bash
# Run from project root
firebase deploy --only hosting
```

## Local Development

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

set GOOGLE_APPLICATION_CREDENTIALS=../service-account.json
uvicorn main:app --reload --port 8080
```

API docs available at `http://localhost:8080/docs`.

To get a Firebase ID token for local API testing:
1. Copy `frontend/public/firebase-config.example.js` → `frontend/public/firebase-config.js` and fill in the actual Firebase project values (this file is gitignored).
2. Open `frontend/public/get-token.html` via a local server (`python -m http.server 3000` inside `frontend/public`), then visit `http://localhost:3000/get-token.html`.

### Frontend
Open `frontend/public/index.html` via a local server (e.g. VS Code Live Server or `python -m http.server`).
