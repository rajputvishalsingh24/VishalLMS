@echo off
title VISHAL SINGH - AI Learning Platform
echo ===================================================
echo     VISHAL SINGH - AI Learning Platform
echo     One Place. Every Subject. Smarter Learning.
echo ===================================================
echo.
echo Starting backend server on http://localhost:8000...
echo.

python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
pause
