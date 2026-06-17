<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/vote.svg" width="80" alt="Logo" />
  <h1>🗳️ CryptoVote</h1>
  <p>
    <b>Aplikasi E-Voting Aman berbasis Kriptografi El Gamal Homomorfik</b>
  </p>
  
  [![Frontend](https://img.shields.io/badge/Frontend-Next.js%2015-black?logo=next.js)](https://nextjs.org/)
  [![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Language](https://img.shields.io/badge/Language-TypeScript%20%7C%20Python-blue)](https://www.typescriptlang.org/)
  [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
</div>

<br />

**CryptoVote** adalah sistem e-voting *end-to-end verifiable* yang dirancang untuk menjaga kerahasiaan suara pemilih menggunakan enkripsi *El Gamal homomorphic*. Sistem ini memungkinkan agregasi (penghitungan suara) dilakukan dalam kondisi terenkripsi tanpa harus mendekripsi surat suara secara individual terlebih dahulu.

---

## ✨ Fitur Utama

- 🔒 **Homomorphic Encryption:** Menghitung total suara *(tally)* secara matematis saat masih terenkripsi.
- 🕵️ **End-to-End Verifiability:** Pemilih mendapatkan *Receipt Hash* dan token untuk memverifikasi bahwa suara mereka tercatat di ledger sistem pusat.
- ⚡ **Modern Stack:** Menggunakan arsitektur pemisahan *backend* (Python FastAPI) untuk komputasi matematis berat, dan *frontend* reaktif (Next.js 15) untuk antarmuka pengguna yang responsif.
- 📊 **Admin Dashboard:** Pantau statistik masuknya suara dan lakukan proses agregasi & dekripsi akhir dengan transparan.

---

## 🏗️ Arsitektur Sistem

- 💻 **Frontend (Port `3000`)**: Dibangun dengan **Next.js 15**, **Tailwind CSS**, dan **shadcn/ui**.
- ⚙️ **Backend (Port `8000`)**: Dibangun dengan **Python FastAPI** dan kriptografi *BigInt* native.

---

## 🚀 Panduan Memulai Cepat

Sistem ini memiliki dua *service* utama yang harus berjalan secara bersamaan. Kami telah menyediakan *script* otomatis agar lebih mudah dijalankan.

### 🐧 Menggunakan Script Otomatis (Linux / macOS)

Cukup jalankan dua script ini di dua terminal terpisah:

**Terminal 1 (Backend):**
```bash
chmod +x start-backend.sh
./start-backend.sh
```

**Terminal 2 (Frontend):**
```bash
chmod +x start-frontend.sh
./start-frontend.sh
```

### 🪟 Menggunakan Script Otomatis (Windows)

Klik dua kali (Double Click) file `.bat` berikut:
- `start-backend.bat`
- `start-frontend.bat`

---

## 🛠️ Instalasi Manual

Jika Anda ingin menjalankannya secara manual, ikuti langkah-langkah berikut:

### 1️⃣ Backend Setup
```bash
cd backend
python -m venv venv

# Aktivasi Environment
# Di Windows: venv\Scripts\activate
# Di Mac/Linux: source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### 2️⃣ Frontend Setup
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

---

## 🧭 Akses Navigasi

Setelah kedua service berjalan (Frontend & Backend), aplikasi dapat diakses di URL berikut:

| Modul | URL Akses | Keterangan |
| :--- | :--- | :--- |
| 🗳️ **Bilik Suara (Voter)** | [http://localhost:3000](http://localhost:3000) | Antarmuka pemilihan untuk pengguna umum |
| 🛡️ **Admin Panel** | [http://localhost:3000/admin](http://localhost:3000/admin) | Dashboard bagi panitia pemilihan |
| 📚 **API Swagger Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Dokumentasi Endpoint Backend (OpenAPI) |
| 🩺 **API Health Check**| [http://localhost:8000/api/health](http://localhost:8000/api/health) | Mengecek status dari backend server |

---

## 🔑 Kredensial Demo Admin

Gunakan akun berikut untuk masuk ke **Admin Panel**:

> **Email:** `admin@kampus.test`  
> **Password:** `admin123`

---

## 🤝 Kontribusi

Sistem ini adalah proyek sumber terbuka (open-source) untuk edukasi mengenai kriptografi pemilu. Anda dipersilakan melakukan _fork_, eksperimen, dan mengirim _Pull Request_.

<br />
<div align="center">
  Dibuat dengan ❤️ untuk pemilu yang lebih transparan.
</div>
