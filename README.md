# CryptoVote

Aplikasi e-voting dengan enkripsi El Gamal homomorfik.

## Arsitektur

- **Frontend**: Next.js 15 (port 3000)
- **Backend**: Python FastAPI (port 8000)

## Cara Menjalankan

### 1. Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

### 3. Atau gunakan script otomatis

Windows: klik dua kali `start-backend.bat` dan `start-frontend.bat`  
Mac/Linux: jalankan `./start-backend.sh` dan `./start-frontend.sh`

## Akses

| Halaman    | URL                              |
| ---------- | -------------------------------- |
| Voter      | http://localhost:3000            |
| Admin      | http://localhost:3000/admin      |
| API Docs   | http://localhost:8000/docs       |
| API Health | http://localhost:8000/api/health |

## Demo Credentials

Email: `admin@kampus.test`  
Password: `admin123`
