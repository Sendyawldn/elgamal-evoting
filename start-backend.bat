@echo off
echo Starting CryptoVote Backend (Python/FastAPI)...
cd backend
call venv\Scripts\activate
uvicorn main:app --reload --port 8000
pause
