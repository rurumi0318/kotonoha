@echo off
set GOOGLE_APPLICATION_CREDENTIALS=%~dp0service-account.json
set TTS_VOICE_NAME=ja-JP-Chirp3-HD-Leda
set TTS_BUCKET_NAME=kotonoha-tts
set TTS_LANGUAGE_CODE=ja-JP
"%~dp0backend\.venv\Scripts\uvicorn" main:app --reload --port 8080 --app-dir "%~dp0backend"
