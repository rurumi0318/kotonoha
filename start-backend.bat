@echo off
set GOOGLE_APPLICATION_CREDENTIALS=%~dp0service-account.json
"%~dp0backend\.venv\Scripts\uvicorn" main:app --reload --port 8080 --app-dir "%~dp0backend"
