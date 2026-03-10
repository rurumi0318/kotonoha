# Environment Overview

## Infrastructure Architecture

### Cloud Services (Google Cloud Platform)
- Frontend Hosting: Firebase Hosting (Global CDN for static assets).
- Backend Server: Google Cloud Run (Serverless container platform).
- Database: Google Cloud Firestore (NoSQL document database).
- Authentication: Firebase Authentication (Google Login integration).
- Container Registry: Artifact Registry (Stores Docker images for backend).

### Tech Stack
- Backend: Python 3.11+ with FastAPI.
- Frontend: Standard HTML/CSS/JavaScript (Extensible to frameworks like Vue/React).
- API Protocol: RESTful API with JSON.
- DevOps: Docker for backend containerization.

## Directory Structure & Responsibilities

`/frontend`
- Purpose: Handles UI/UX, user interaction, and client-side logic.
- Key Files:
  - public/index.html: Main entry point.
  - firebase.json: Hosting configurations and rewrite rules.
- Deployment: firebase deploy --only hosting

`/backend`
- Purpose: Handles dictionary lookup (Jamdict), database operations, and business logic.
- Key Files:
  - main.py: API endpoints and application logic.
  - Dockerfile: Instructions for containerizing the Python environment.
  - requirements.txt: Python dependencies (FastAPI, Uvicorn, Jamdict).
- Deployment: gcloud run deploy project-kotonoha --source .

## Development Workflow

1. Local Testing: Run FastAPI locally using uvicorn main:app --reload and open index.html via a local server (e.g., VS Code Live Server).
2. Backend Update: Deploy changes to Cloud Run if API logic or dictionary data changes.
3. Frontend Update: Update the API endpoint URL if necessary, then deploy to Firebase Hosting.