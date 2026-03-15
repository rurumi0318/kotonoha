@echo off
pushd "%~dp0frontend\public"
python -m http.server 3000
popd
