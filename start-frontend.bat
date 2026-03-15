@echo off
python -m http.server 3000 --directory "%~dp0frontend\public"
