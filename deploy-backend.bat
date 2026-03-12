@echo off
if not exist backend\data\examples.db (
    echo Error: backend\data\examples.db not found.
    echo Run "cd backend && python tools/build_example_db.py" first.
    exit /b 1
)
gcloud run deploy kotonoha-backend --source backend --region asia-east1 --allow-unauthenticated
