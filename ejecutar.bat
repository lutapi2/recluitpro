@echo off
cd /d "%~dp0"
echo Iniciando RecruitPro en http://127.0.0.1:8000 ...
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
pause
