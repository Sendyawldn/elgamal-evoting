# Instruksi Membangun CryptoVote dari Awal

## Arsitektur: Frontend (Next.js) + Backend (Python/FastAPI)

---

## Gambaran Umum Proyek

CryptoVote adalah aplikasi e-voting berbasis web yang menggunakan enkripsi **El Gamal Homomorfik** sebagai model keamanan. Artinya, suara dienkripsi di browser dan dijumlahkan tanpa pernah membuka isi pilihan individu — hanya hasil akhir yang didekripsi.

**Struktur folder akhir yang ingin dicapai:**

```
elgamal-evoting/
├── backend/                  # Python FastAPI
│   ├── main.py
│   ├── requirements.txt
│   ├── elgamal_utils.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── election.py
│   │   ├── admin.py
│   │   └── health.py
│   ├── store/
│   │   ├── __init__.py
│   │   └── election_store.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   └── .env.example
│
├── frontend/                 # Next.js 15
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── globals.css
│   │   │   └── admin/
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   └── ui/
│   │   │       ├── button.tsx
│   │   │       ├── card.tsx
│   │   │       ├── badge.tsx
│   │   │       └── progress.tsx
│   │   ├── features/
│   │   │   └── voting/
│   │   │       ├── components/
│   │   │       │   ├── crypto-vote-app.tsx
│   │   │       │   └── admin-panel.tsx
│   │   │       ├── types.ts
│   │   │       └── tally.ts
│   │   └── lib/
│   │       ├── api-client.ts
│   │       ├── elgamal.ts
│   │       └── utils.ts
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   └── .env.local.example
│
├── start-backend.bat         # Windows
├── start-frontend.bat        # Windows
├── start-backend.sh          # Mac/Linux
├── start-frontend.sh         # Mac/Linux
└── README.md
```

---

## BAGIAN 1 — BACKEND (Python/FastAPI)

### Langkah 1.1 — Setup Folder dan Virtual Environment

Buka terminal, lalu jalankan:

```bash
mkdir cryptovote
cd cryptovote
mkdir backend
cd backend
python -m venv venv
```

Aktifkan virtual environment:

```bash
# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### Langkah 1.2 — Install Dependencies

Buat file `backend/requirements.txt` dengan isi:

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
python-dotenv==1.0.1
pydantic==2.8.2
pymongo==4.8.0
python-multipart==0.0.9
```

Lalu install:

```bash
pip install -r requirements.txt
```

### Langkah 1.3 — File `.env.example`

Buat file `backend/.env.example`:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=cryptovote
ELECTION_PRIVATE_KEY=91236781236781236781236781236781
CORS_ORIGINS=http://localhost:3000
```

Salin ke `.env` dan sesuaikan nilainya.

---

### Langkah 1.4 — Logika Kriptografi El Gamal

Buat file `backend/elgamal_utils.py`:

```python
"""
El Gamal Homomorphic Encryption — Python Implementation
Semua operasi menggunakan native Python int (mendukung BigInt tanpa batas).
"""

import os
import random
import json
import base64
import hashlib
from dataclasses import dataclass, field
from typing import Optional

# Parameter demo El Gamal (safe prime 127-bit untuk presentasi)
DEMO_P = 170141183460469231731687303715884105727
DEMO_G = 3
DEMO_PRIVATE_KEY_STR = os.getenv("ELECTION_PRIVATE_KEY", "91236781236781236781236781236781")


def mod_pow(base: int, exp: int, mod: int) -> int:
    return pow(base, exp, mod)


def mod_inverse(value: int, mod: int) -> int:
    g, x, _ = extended_gcd(value % mod, mod)
    if g != 1:
        raise ValueError("Modular inverse does not exist")
    return x % mod


def extended_gcd(a: int, b: int):
    if a == 0:
        return b, 0, 1
    g, x, y = extended_gcd(b % a, a)
    return g, y - (b // a) * x, x


@dataclass
class PublicKey:
    p: int
    g: int
    y: int


@dataclass
class PrivateKey:
    x: int
    public_key: PublicKey


@dataclass
class Ciphertext:
    c1: int
    c2: int


def generate_keypair(p: int = DEMO_P, g: int = DEMO_G, x: Optional[int] = None) -> PrivateKey:
    if x is None:
        x = random.randint(2, p - 2)
    y = mod_pow(g, x, p)
    return PrivateKey(x=x, public_key=PublicKey(p=p, g=g, y=y))


def encrypt(message: int, pub: PublicKey, nonce: Optional[int] = None) -> Ciphertext:
    if nonce is None:
        nonce = random.randint(2, pub.p - 2)
    c1 = mod_pow(pub.g, nonce, pub.p)
    c2 = (message * mod_pow(pub.y, nonce, pub.p)) % pub.p
    return Ciphertext(c1=c1, c2=c2)


def decrypt(ct: Ciphertext, priv: PrivateKey) -> int:
    shared = mod_pow(ct.c1, priv.x, priv.public_key.p)
    inv = mod_inverse(shared, priv.public_key.p)
    return (ct.c2 * inv) % priv.public_key.p


def multiply_ciphertexts(a: Ciphertext, b: Ciphertext, pub: PublicKey) -> Ciphertext:
    return Ciphertext(
        c1=(a.c1 * b.c1) % pub.p,
        c2=(a.c2 * b.c2) % pub.p,
    )


def encrypt_exponent_vote(vote: int, pub: PublicKey, nonce: Optional[int] = None) -> Ciphertext:
    """Enkripsi suara sebagai g^vote mod p (0 atau 1)."""
    message = mod_pow(pub.g, vote, pub.p)
    return encrypt(message, pub, nonce)


def decode_small_exponent(encoded: int, pub: PublicKey, maximum: int = 10000) -> int:
    """Dekode g^x mod p dengan brute-force untuk nilai kecil."""
    cursor = 1
    for exp in range(maximum + 1):
        if cursor == encoded:
            return exp
        cursor = (cursor * pub.g) % pub.p
    raise ValueError("Vote count is outside the search range")


def serialize_ciphertext(ct: Ciphertext) -> dict:
    return {"c1": hex(ct.c1)[2:], "c2": hex(ct.c2)[2:]}


def deserialize_ciphertext(data: dict) -> Ciphertext:
    return Ciphertext(c1=int(data["c1"], 16), c2=int(data["c2"], 16))


def serialize_public_key(pub: PublicKey) -> dict:
    return {"p": hex(pub.p)[2:], "g": hex(pub.g)[2:], "y": hex(pub.y)[2:]}


def deserialize_public_key(data: dict) -> PublicKey:
    return PublicKey(
        p=int(data["p"], 16),
        g=int(data["g"], 16),
        y=int(data["y"], 16),
    )


# --- Singleton kunci pemilihan ---
def _load_election_keypair() -> PrivateKey:
    try:
        x = int(DEMO_PRIVATE_KEY_STR)
        if x <= 1:
            raise ValueError
        return generate_keypair(x=x)
    except Exception:
        return generate_keypair(x=int("91236781236781236781236781236781"))


ELECTION_KEYPAIR: PrivateKey = _load_election_keypair()
ELECTION_PUBLIC_KEY: PublicKey = ELECTION_KEYPAIR.public_key


# --- Token & Receipt ---
def create_receipt_hash(created_at: str, choices: list[dict]) -> str:
    canonical = json.dumps(
        {
            "createdAt": created_at,
            "choices": [
                {"candidateId": c["candidateId"], "c1": c["ciphertext"]["c1"], "c2": c["ciphertext"]["c2"]}
                for c in choices
            ],
        },
        separators=(",", ":"),
    )
    h = 0xCBF29CE484222325
    for ch in canonical:
        h ^= ord(ch)
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return hex(h)[2:].zfill(16)


def encode_token_payload(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"))
    b64 = base64.b64encode(raw.encode()).decode()
    return b64.replace("+", "-").replace("/", "_").rstrip("=")


def decode_token_payload(token_body: str) -> dict:
    padded = token_body + "=" * ((4 - len(token_body) % 4) % 4)
    raw = base64.b64decode(padded.replace("-", "+").replace("_", "/"))
    return json.loads(raw)


def create_encrypted_vote_receipt(
    candidate_ids: list[str],
    selected_candidate_id: str,
    timestamp_iso: str,
) -> dict:
    if selected_candidate_id not in candidate_ids:
        raise ValueError("Selected candidate not in election")

    pub = ELECTION_PUBLIC_KEY
    encrypted_choices = []
    for cid in candidate_ids:
        vote_val = 1 if cid == selected_candidate_id else 0
        ct = encrypt_exponent_vote(vote_val, pub)
        encrypted_choices.append({"candidateId": cid, "ciphertext": serialize_ciphertext(ct)})

    receipt_hash = create_receipt_hash(timestamp_iso, encrypted_choices)
    payload = {
        "version": 1,
        "createdAt": timestamp_iso,
        "publicKey": serialize_public_key(pub),
        "choices": encrypted_choices,
        "receiptHash": receipt_hash,
    }
    token = f"EGV1.{encode_token_payload(payload)}"
    short_code = f"EG-{receipt_hash[:18].upper()}"

    return {
        "token": token,
        "receiptHash": receipt_hash,
        "shortCode": short_code,
        "createdAt": timestamp_iso,
        "encryptedChoices": encrypted_choices,
    }


def parse_vote_token(token: str) -> Optional[dict]:
    if not token.startswith("EGV1."):
        return None
    try:
        payload = decode_token_payload(token[5:])
        if payload.get("version") != 1:
            return None
        return payload
    except Exception:
        return None


def verify_vote_token(token: str, ledger: list[dict]) -> dict:
    payload = parse_vote_token(token)
    if not payload:
        return {"status": "invalid", "message": "Token tidak valid atau formatnya bukan EGV1."}

    computed_hash = create_receipt_hash(payload["createdAt"], payload["choices"])
    if computed_hash != payload["receiptHash"]:
        return {"status": "invalid", "message": "Hash token tidak cocok dengan ciphertext."}

    entry = next((e for e in ledger if e["receiptHash"] == payload["receiptHash"]), None)
    if not entry:
        return {"status": "invalid", "message": "Token belum ditemukan di ledger hitung."}

    return {
        "status": "verified",
        "receiptHash": payload["receiptHash"],
        "message": "Token valid dan ciphertext-nya sudah masuk agregasi. Pilihan tetap tidak dibuka.",
    }


def aggregate_encrypted_choices(ledger: list[dict]) -> dict:
    """Kalikan semua ciphertext per kandidat (operasi homomorfik)."""
    totals: dict[str, Ciphertext] = {}
    pub = ELECTION_PUBLIC_KEY
    for entry in ledger:
        for choice in entry["encryptedChoices"]:
            cid = choice["candidateId"]
            ct = deserialize_ciphertext(choice["ciphertext"])
            if cid in totals:
                totals[cid] = multiply_ciphertexts(totals[cid], ct, pub)
            else:
                totals[cid] = ct
    return totals


def decrypt_aggregated_vote(aggregate: Ciphertext, max_votes: int) -> int:
    encoded = decrypt(aggregate, ELECTION_KEYPAIR)
    return decode_small_exponent(encoded, ELECTION_PUBLIC_KEY, max_votes)
```

---

### Langkah 1.5 — Schema Pydantic

Buat file `backend/models/__init__.py` (kosong) dan `backend/models/schemas.py`:

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class Candidate(BaseModel):
    id: str
    name: str
    party: str
    color: str = "var(--chart-1)"
    platform: str
    votes: int = 0


class Voter(BaseModel):
    id: str
    email: str
    identifier: str
    name: Optional[str] = None
    hasVoted: bool = False
    votedAt: Optional[str] = None


class AdminUser(BaseModel):
    id: str
    email: str
    role: Literal["admin"] = "admin"


ElectionStatus = Literal["draft", "open", "closed"]


class Election(BaseModel):
    id: str
    title: str = ""
    description: str = ""
    region: str = ""
    closesAt: str = ""
    status: ElectionStatus = "draft"
    totalVoters: int = 0
    ballotsCast: int = 0
    authorizedVoters: list[Voter] = Field(default_factory=list)
    admins: list[AdminUser] = Field(default_factory=list)
    candidates: list[Candidate] = Field(default_factory=list)


class EncryptedChoice(BaseModel):
    candidateId: str
    ciphertext: dict  # {"c1": hex, "c2": hex}


class VoteLedgerEntry(BaseModel):
    receiptHash: str
    token: str
    createdAt: str
    candidateId: Optional[str] = None
    voterName: Optional[str] = None
    encryptedChoices: list[EncryptedChoice]


class VoteRequest(BaseModel):
    voterIdentifier: str
    candidateId: str
    receipt: dict  # raw receipt payload dari frontend


class VerifyTokenRequest(BaseModel):
    token: str


class ElectionUpdateRequest(BaseModel):
    id: str
    title: str = ""
    description: str = ""
    region: str = ""
    closesAt: str = ""
    status: ElectionStatus = "draft"
    totalVoters: int = 0
    ballotsCast: int = 0
    authorizedVoters: list[dict] = Field(default_factory=list)
    admins: list[dict] = Field(default_factory=list)
    candidates: list[dict] = Field(default_factory=list)
```

---

### Langkah 1.6 — Store (Penyimpanan Data)

Buat file `backend/store/__init__.py` (kosong) dan `backend/store/election_store.py`:

```python
"""
Lapisan penyimpanan data.
Prioritas: MongoDB → fallback file JSON lokal di folder .data/
"""

import json
import os
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

from models.schemas import Election, VoteLedgerEntry

# Seed data awal (kosong, admin harus mengisi lewat panel)
SEED_ELECTION = {
    "id": "campus-2026",
    "title": "",
    "description": "",
    "region": "",
    "closesAt": "",
    "status": "draft",
    "totalVoters": 0,
    "ballotsCast": 0,
    "authorizedVoters": [],
    "admins": [{"id": "ADM-001", "email": "admin@kampus.test", "role": "admin"}],
    "candidates": [],
}

DATA_DIR = Path(".data")
ELECTION_STATE_FILE = DATA_DIR / "election-state.json"
LEDGER_FILE = DATA_DIR / "vote-ledger.json"

# --- MongoDB (opsional) ---
_mongo_client = None
_mongo_unavailable = False
_last_mongo_failure = 0.0
MONGO_RETRY_DELAY = 5.0


def _get_mongo_db():
    global _mongo_client, _mongo_unavailable, _last_mongo_failure
    import time

    uri = os.getenv("MONGODB_URI")
    if not uri:
        return None
    if _mongo_unavailable and (time.time() - _last_mongo_failure) < MONGO_RETRY_DELAY:
        return None
    try:
        if _mongo_client is None:
            from pymongo import MongoClient
            _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=1200)
            _mongo_client.admin.command("ping")
            _mongo_unavailable = False
        db_name = os.getenv("MONGODB_DB", "cryptovote")
        return _mongo_client[db_name]
    except Exception:
        _mongo_client = None
        _mongo_unavailable = True
        _last_mongo_failure = time.time()
        return None


# --- Helpers file lokal ---
def _read_local_election_state() -> dict:
    try:
        content = ELECTION_STATE_FILE.read_text(encoding="utf-8")
        state = json.loads(content)
        return {
            "election": state.get("election", dict(SEED_ELECTION)),
            "history": state.get("history", []),
        }
    except Exception:
        state = {"election": dict(SEED_ELECTION), "history": []}
        _write_local_election_state(state)
        return state


def _write_local_election_state(state: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ELECTION_STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def _read_local_ledger() -> list[dict]:
    try:
        content = LEDGER_FILE.read_text(encoding="utf-8")
        data = json.loads(content)
        return data.get("entries", [])
    except Exception:
        _write_local_ledger([])
        return []


def _write_local_ledger(entries: list[dict]):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LEDGER_FILE.write_text(json.dumps({"entries": entries}, indent=2, ensure_ascii=False), encoding="utf-8")


# --- Public API Store ---
def get_election_state() -> dict:
    db = _get_mongo_db()
    if db is None:
        state = _read_local_election_state()
        return {**state, "persistence": "local-file"}

    col = db["elections"]
    history_col = db["election_history"]
    doc = col.find_one({"_id": SEED_ELECTION["id"]})
    history = list(history_col.find({}, {"_id": 0}).sort("updatedAt", -1))

    if doc:
        doc.pop("_id", None)
        doc.pop("updatedAt", None)
        return {"election": doc, "history": history, "persistence": "mongodb"}

    col.insert_one({**SEED_ELECTION, "_id": SEED_ELECTION["id"], "updatedAt": _now()})
    return {"election": dict(SEED_ELECTION), "history": [], "persistence": "mongodb"}


def save_election_state(election: dict) -> dict:
    db = _get_mongo_db()
    if db is None:
        local = _read_local_election_state()
        _write_local_election_state({"election": election, "history": local["history"]})
        return {"election": election, "history": local["history"], "persistence": "local-file"}

    col = db["elections"]
    history_col = db["election_history"]
    col.update_one(
        {"_id": election["id"]},
        {"$set": {**election, "updatedAt": _now()}},
        upsert=True,
    )
    history = list(history_col.find({}, {"_id": 0}).sort("updatedAt", -1))
    return {"election": election, "history": history, "persistence": "mongodb"}


def archive_election_state(election: dict) -> dict:
    archived = {**election, "id": f"{election['id']}-{int(_now_ts())}"}
    _archive_ledger_entries(election["id"], archived["id"])
    db = _get_mongo_db()

    if db is None:
        local = _read_local_election_state()
        _write_local_election_state({
            "election": dict(SEED_ELECTION),
            "history": [archived, *local["history"]],
        })
        return {"election": dict(SEED_ELECTION), "history": [archived, *local["history"]], "persistence": "local-file"}

    col = db["elections"]
    history_col = db["election_history"]
    history_col.insert_one({**archived, "_id": archived["id"], "updatedAt": _now()})
    col.update_one(
        {"_id": SEED_ELECTION["id"]},
        {"$set": {**SEED_ELECTION, "updatedAt": _now()}},
        upsert=True,
    )
    history = list(history_col.find({}, {"_id": 0}).sort("updatedAt", -1))
    return {"election": dict(SEED_ELECTION), "history": history, "persistence": "mongodb"}


def list_ledger_entries(election_id: str) -> list[dict]:
    db = _get_mongo_db()
    if db is None:
        entries = _read_local_ledger()
        return [_strip_ledger_meta(e) for e in entries if e.get("electionId") == election_id]

    col = db["vote_ledger"]
    docs = list(col.find({"electionId": election_id}, {"_id": 0}).sort("createdAt", 1))
    return [_strip_ledger_meta(d) for d in docs]


def count_ledger_entries(election_id: str) -> int:
    db = _get_mongo_db()
    if db is None:
        return sum(1 for e in _read_local_ledger() if e.get("electionId") == election_id)
    return db["vote_ledger"].count_documents({"electionId": election_id})


def append_ledger_entry(entry: dict):
    db = _get_mongo_db()
    if db is None:
        entries = _read_local_ledger()
        duplicate = any(
            e.get("electionId") == entry["electionId"] and e.get("receiptHash") == entry["receiptHash"]
            for e in entries
        )
        if duplicate:
            raise ValueError("Duplicate receipt")
        _write_local_ledger([*entries, entry])
        return

    col = db["vote_ledger"]
    doc_id = f"{entry['electionId']}:{entry['receiptHash']}"
    try:
        col.insert_one({**entry, "_id": doc_id})
    except Exception:
        raise ValueError("Duplicate receipt")


def _archive_ledger_entries(old_id: str, new_id: str):
    db = _get_mongo_db()
    now = _now()
    if db is None:
        entries = _read_local_ledger()
        _write_local_ledger([
            {**e, "electionId": new_id, "updatedAt": now} if e.get("electionId") == old_id else e
            for e in entries
        ])
        return
    db["vote_ledger"].update_many(
        {"electionId": old_id},
        {"$set": {"electionId": new_id, "updatedAt": now}},
    )


def _strip_ledger_meta(entry: dict) -> dict:
    return {
        "receiptHash": entry.get("receiptHash"),
        "token": entry.get("token"),
        "createdAt": entry.get("createdAt"),
        "candidateId": entry.get("candidateId"),
        "voterName": entry.get("voterName"),
        "encryptedChoices": entry.get("encryptedChoices", []),
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp() * 1000
```

---

### Langkah 1.7 — Route: Health Check

Buat file `backend/routes/__init__.py` (kosong) dan `backend/routes/health.py`:

```python
from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "cryptovote",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
```

---

### Langkah 1.8 — Route: Election (Public)

Buat file `backend/routes/election.py`:

```python
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from models.schemas import VoteRequest, VerifyTokenRequest
from store.election_store import (
    get_election_state,
    save_election_state,
    list_ledger_entries,
    count_ledger_entries,
    append_ledger_entry,
)
from elgamal_utils import (
    ELECTION_PUBLIC_KEY,
    serialize_public_key,
    verify_vote_token,
    parse_vote_token,
    create_receipt_hash,
)

router = APIRouter(prefix="/elections")


@router.get("/{election_id}/results")
def get_results(election_id: str):
    state = get_election_state()
    election = state["election"]
    if election["id"] != election_id:
        raise HTTPException(status_code=404, detail={
            "type": "https://cryptovote.local/problems/not-found",
            "title": "Election not found",
            "status": 404,
            "code": "ELECTION_NOT_FOUND",
        })
    ballots = election["ballotsCast"]
    return {
        "electionId": election["id"],
        "title": election["title"],
        "totalVoters": election["totalVoters"],
        "ballotsCast": ballots,
        "status": election["status"],
        "verificationStatus": "demo-elgamal",
        "candidates": [
            {
                "id": c["id"],
                "name": c["name"],
                "party": c["party"],
                "votes": c["votes"],
                "percent": round(c["votes"] / ballots * 100, 1) if ballots > 0 else 0,
            }
            for c in election["candidates"]
        ],
    }


@router.post("/{election_id}/results")
def cast_vote(election_id: str, body: VoteRequest):
    state = get_election_state()
    election = state["election"]

    if election["id"] != election_id:
        raise HTTPException(status_code=404, detail=_err("ELECTION_NOT_FOUND", "Election not found", 404))
    if election["status"] != "open":
        raise HTTPException(status_code=409, detail=_err("ELECTION_NOT_OPEN", "Election is not open", 409))

    norm_id = body.voterIdentifier.strip().lower()
    voter = next(
        (v for v in election["authorizedVoters"]
         if any(
             x and x.strip().lower() == norm_id
             for x in [v.get("identifier"), v.get("id"), v.get("email")]
         )),
        None,
    )

    if not voter:
        raise HTTPException(status_code=403, detail=_err("VOTER_NOT_IN_DPT", "Voter is not in DPT", 403))
    if voter.get("hasVoted"):
        raise HTTPException(status_code=409, detail=_err("VOTER_ALREADY_VOTED", "Voter has already voted", 409))

    candidate_ids = sorted(c["id"] for c in election["candidates"])
    if body.candidateId not in candidate_ids:
        raise HTTPException(status_code=404, detail=_err("CANDIDATE_NOT_FOUND", "Candidate not found", 404))

    receipt = body.receipt
    _validate_receipt_or_raise(receipt, candidate_ids)

    voted_at = datetime.now(timezone.utc).isoformat()
    ledger_entry = {
        "receiptHash": receipt["receiptHash"],
        "token": receipt["token"],
        "createdAt": receipt["createdAt"],
        "candidateId": body.candidateId,
        "voterName": norm_id,
        "encryptedChoices": receipt["encryptedChoices"],
        "electionId": election["id"],
        "voterIdentifier": norm_id,
        "updatedAt": voted_at,
    }

    try:
        append_ledger_entry(ledger_entry)
    except ValueError:
        raise HTTPException(status_code=409, detail=_err("VOTE_REJECTED", "Receipt is already recorded", 409))

    updated_election = {
        **election,
        "ballotsCast": election["ballotsCast"] + 1,
        "candidates": [
            {**c, "votes": c["votes"] + 1} if c["id"] == body.candidateId else c
            for c in election["candidates"]
        ],
        "authorizedVoters": [
            {**v, "hasVoted": True, "votedAt": voted_at} if v["id"] == voter["id"] else v
            for v in election["authorizedVoters"]
        ],
    }
    saved = save_election_state(updated_election)

    return {
        "election": {"id": saved["election"]["id"], "ballotsCast": saved["election"]["ballotsCast"]},
        "persistence": saved["persistence"],
        "ledgerSize": count_ledger_entries(election["id"]),
    }


@router.post("/{election_id}/verify")
def verify_token(election_id: str, body: VerifyTokenRequest):
    state = get_election_state()
    if state["election"]["id"] != election_id:
        raise HTTPException(status_code=404, detail=_err("ELECTION_NOT_FOUND", "Election not found", 404))

    if not body.token.strip():
        raise HTTPException(status_code=400, detail=_err("INVALID_TOKEN", "Verification token is required", 400))

    ledger = list_ledger_entries(election_id)
    result = verify_vote_token(body.token.strip(), ledger)
    return {**result, "ledgerSize": len(ledger)}


@router.get("/public-key")
def get_public_key():
    return {"publicKey": serialize_public_key(ELECTION_PUBLIC_KEY)}


def _validate_receipt_or_raise(receipt: dict, candidate_ids: list[str]):
    required = ["receiptHash", "token", "createdAt", "encryptedChoices"]
    for key in required:
        if not receipt.get(key):
            raise HTTPException(status_code=400, detail=_err("INVALID_RECEIPT", f"Missing field: {key}", 400))

    payload = parse_vote_token(receipt["token"])
    if not payload:
        raise HTTPException(status_code=400, detail=_err("INVALID_RECEIPT", "Receipt token format is invalid", 400))

    if payload["receiptHash"] != receipt["receiptHash"] or payload["createdAt"] != receipt["createdAt"]:
        raise HTTPException(status_code=400, detail=_err("INVALID_RECEIPT", "Token metadata mismatch", 400))

    receipt_cid = sorted(c["candidateId"] for c in receipt["encryptedChoices"])
    if receipt_cid != candidate_ids:
        raise HTTPException(status_code=400, detail=_err("INVALID_RECEIPT", "Candidate vector mismatch", 400))


def _err(code: str, title: str, status: int) -> dict:
    return {
        "type": f"https://cryptovote.local/problems/{code.lower().replace('_', '-')}",
        "title": title,
        "status": status,
        "code": code,
    }
```

---

### Langkah 1.9 — Route: Admin

Buat file `backend/routes/admin.py`:

```python
from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from models.schemas import ElectionUpdateRequest
from store.election_store import (
    get_election_state,
    save_election_state,
    archive_election_state,
    list_ledger_entries,
)
from elgamal_utils import (
    aggregate_encrypted_choices,
    decrypt_aggregated_vote,
    deserialize_ciphertext,
)

router = APIRouter(prefix="/admin")
ADMIN_HEADER = "x-cryptovote-admin"


def _require_admin(x_cryptovote_admin: Optional[str] = Header(default=None)):
    if x_cryptovote_admin != "true":
        raise HTTPException(status_code=403, detail={
            "type": "https://cryptovote.local/problems/forbidden",
            "title": "Admin authorization required",
            "status": 403,
            "code": "ADMIN_REQUIRED",
        })


@router.get("/election")
def get_election(x_cryptovote_admin: Optional[str] = Header(default=None)):
    return get_election_state()


@router.put("/election")
def update_election(
    body: ElectionUpdateRequest,
    x_cryptovote_admin: Optional[str] = Header(default=None),
):
    _require_admin(x_cryptovote_admin)
    election = _normalize_election(body)
    err = _validate_election(election)
    if err:
        raise HTTPException(status_code=400, detail={
            "type": "https://cryptovote.local/problems/invalid-election",
            "title": err,
            "status": 400,
            "code": "INVALID_ELECTION_UPDATE",
        })
    return save_election_state(election)


@router.post("/election")
def archive_election(
    body: ElectionUpdateRequest,
    x_cryptovote_admin: Optional[str] = Header(default=None),
):
    _require_admin(x_cryptovote_admin)
    election = _normalize_election(body)
    return archive_election_state(election)


@router.get("/tally")
def get_tally(x_cryptovote_admin: Optional[str] = Header(default=None)):
    _require_admin(x_cryptovote_admin)
    state = get_election_state()
    election = state["election"]

    if election["status"] != "closed":
        raise HTTPException(status_code=409, detail={
            "type": "https://cryptovote.local/problems/election-open",
            "title": "Election must be closed before aggregation",
            "status": 409,
            "code": "ELECTION_NOT_CLOSED",
        })

    ledger = list_ledger_entries(election["id"])
    aggregates = aggregate_encrypted_choices(ledger)

    tally = {}
    for candidate in election["candidates"]:
        cid = candidate["id"]
        aggregate = aggregates.get(cid)
        if aggregate:
            tally[cid] = decrypt_aggregated_vote(aggregate, len(ledger))
        else:
            tally[cid] = 0

    return {
        "tally": tally,
        "ledgerSize": len(ledger),
        "logs": [
            f"Mengambil {len(ledger)} suara terenkripsi dari ledger.",
            "Mengalikan ciphertext per kandidat dengan operasi homomorphic.",
            "Mendekripsi hasil agregat memakai private key di sisi server.",
            "Selesai. Hasil akhir siap dibaca admin.",
        ],
    }


def _normalize_election(body: ElectionUpdateRequest) -> dict:
    candidates = [_normalize_candidate(c) for c in body.candidates]
    voters = [_normalize_voter(v) for v in body.authorizedVoters]
    return {
        "id": body.id,
        "title": body.title,
        "description": body.description,
        "region": body.region,
        "closesAt": body.closesAt,
        "status": body.status,
        "totalVoters": len(voters),
        "ballotsCast": sum(1 for v in voters if v.get("hasVoted")),
        "authorizedVoters": voters,
        "admins": body.admins,
        "candidates": candidates,
    }


def _normalize_candidate(c: dict) -> dict:
    return {
        "id": _slugify(c.get("id") or c.get("name", "")),
        "name": c.get("name", "").strip(),
        "party": c.get("party", "").strip(),
        "color": c.get("color", "var(--chart-1)"),
        "platform": c.get("platform", "").strip(),
        "votes": max(0, int(c.get("votes", 0))),
    }


def _normalize_voter(v: dict) -> dict:
    identifier = (v.get("identifier") or v.get("id") or v.get("email", "")).strip()
    slug = _slugify(identifier)
    email = v.get("email") or f"{slug}@local.voter"
    return {
        "id": slug,
        "email": email.strip().lower(),
        "identifier": identifier,
        "name": v.get("name"),
        "hasVoted": bool(v.get("hasVoted")),
        "votedAt": v.get("votedAt"),
    }


def _validate_election(election: dict) -> Optional[str]:
    if not election.get("id"):
        return "Election id is required"
    if election["status"] == "open":
        if not all([election.get("title"), election.get("description"), election.get("region")]):
            return "Title, description, and region are required before opening"
        if len(election.get("candidates", [])) < 2:
            return "At least two candidates are required before opening"
    return None


def _slugify(value: str) -> str:
    import re
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", value.strip().lower()))
```

---

### Langkah 1.10 — Entry Point Backend

Buat file `backend/main.py`:

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes.health import router as health_router
from routes.election import router as election_router
from routes.admin import router as admin_router

app = FastAPI(
    title="CryptoVote API",
    description="Backend El Gamal homomorphic e-voting",
    version="1.0.0",
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(election_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/")
def root():
    return {"message": "CryptoVote API is running. Docs: /docs"}
```

Jalankan backend:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Buka `http://localhost:8000/docs` untuk melihat dokumentasi API otomatis.

---

## BAGIAN 2 — FRONTEND (Next.js 15)

### Langkah 2.1 — Setup Project Next.js

Dari root folder `cryptovote/`:

```bash
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --no-turbopack
```

Pilih opsi default saat ditanya.

### Langkah 2.2 — Install Dependencies Tambahan

```bash
cd frontend
npm install lucide-react recharts class-variance-authority clsx tailwind-merge @radix-ui/react-slot @radix-ui/react-progress
npm install -D @types/node @testing-library/react @testing-library/jest-dom vitest jsdom
```

### Langkah 2.3 — File `.env.local.example`

Buat file `frontend/.env.local.example`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Salin ke `.env.local`.

### Langkah 2.4 — API Client

Buat file `frontend/src/lib/api-client.ts`:

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function apiGet<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.title ?? "Request failed", res.status, err.code);
  }
  return res.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.title ?? "Request failed", res.status, err.code);
  }
  return res.json();
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.title ?? "Request failed", res.status, err.code);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export const ADMIN_HEADERS = { "x-cryptovote-admin": "true" };
```

### Langkah 2.5 — Logika El Gamal di Frontend (Browser)

Buat file `frontend/src/lib/elgamal.ts`.

> Salin isi file `src/lib/elgamal.ts` dari repositori cryptovote lama ke sini **persis sama**. File ini berisi fungsi-fungsi BigInt murni (tidak ada dependency Node.js) sehingga bisa berjalan langsung di browser.

### Langkah 2.6 — Types dan Tally

Buat file `frontend/src/features/voting/types.ts`.

> Salin isi file `src/features/voting/types.ts` dari repositori lama **persis sama**.

Buat file `frontend/src/features/voting/tally.ts`.

> Salin isi file `src/features/voting/tally.ts` dari repositori lama **persis sama**.

> **Catatan:** Kedua file di atas tidak punya ketergantungan ke API Next.js (`/api/...`), sehingga bisa langsung digunakan.

### Langkah 2.7 — Komponen UI

Buat folder `frontend/src/components/ui/` lalu salin file-file berikut dari repositori lama **persis sama**:

- `button.tsx`
- `card.tsx`
- `badge.tsx`
- `progress.tsx`

Buat file `frontend/src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Langkah 2.8 — Komponen Voting App

Buat file `frontend/src/features/voting/components/crypto-vote-app.tsx`.

> Salin isi file `src/features/voting/components/crypto-vote-app.tsx` dari repositori lama, lalu **ubah semua URL fetch** dari format lama ke format baru menggunakan `api-client.ts`.

Perubahan utama yang perlu dilakukan:

**Sebelum (menggunakan Next.js internal API):**

```typescript
// Lama — fetch ke route handler Next.js
const response = await fetch("/api/admin/election", { cache: "no-store" })
const response = await fetch("/api/election/public-key", { cache: "no-store" })
const response = await fetch(`/api/elections/${id}/results`, { method: "POST", ... })
const response = await fetch(`/api/elections/${id}/verify`, { method: "POST", ... })
```

**Sesudah (menggunakan api-client ke Python backend):**

```typescript
// Baru — import dari api-client
import { apiGet, apiPost, ADMIN_HEADERS } from "@/lib/api-client";

// Ganti semua fetch menjadi:
const body = await apiGet<{ election: Election }>("/api/admin/election");
const pkBody = await apiGet<{ publicKey: SerializedElGamalPublicKey }>(
  "/api/elections/public-key",
);
const result = await apiPost(`/api/elections/${id}/results`, payload);
const verify = await apiPost(`/api/elections/${id}/verify`, { token });
```

### Langkah 2.9 — Komponen Admin Panel

Buat file `frontend/src/features/voting/components/admin-panel.tsx`.

> Salin isi file `src/features/voting/components/admin-panel.tsx` dari repositori lama, lalu **ubah semua URL fetch** sama seperti langkah 2.8.

Perubahan utama:

```typescript
// Lama
const response = await fetch("/api/admin/election", { cache: "no-store" })
await fetch("/api/admin/election", { method: "PUT", headers: { "x-cryptovote-admin": "true" }, ... })
await fetch("/api/admin/election", { method: "POST", headers: { "x-cryptovote-admin": "true" }, ... })
await fetch("/api/admin/tally", { headers: { "x-cryptovote-admin": "true" }, ... })

// Baru
import { apiGet, apiPost, apiPut, ADMIN_HEADERS } from "@/lib/api-client"

const body = await apiGet("/api/admin/election")
await apiPut("/api/admin/election", electionData, ADMIN_HEADERS)
await apiPost("/api/admin/election", electionData, ADMIN_HEADERS)
await apiGet("/api/admin/tally", { headers: ADMIN_HEADERS })
```

### Langkah 2.10 — Pages

Buat file `frontend/src/app/page.tsx`:

```typescript
import { CryptoVoteApp } from "@/features/voting/components/crypto-vote-app"
import { election } from "@/features/voting/election-data"

export default function Home() {
  return <CryptoVoteApp election={election} />
}
```

Buat file `frontend/src/features/voting/election-data.ts`:

```typescript
import type { Election } from "./types";

export const election: Election = {
  id: "campus-2026",
  title: "",
  description: "",
  region: "",
  closesAt: "",
  status: "draft",
  totalVoters: 0,
  ballotsCast: 0,
  authorizedVoters: [],
  admins: [{ id: "ADM-001", email: "admin@kampus.test", role: "admin" }],
  candidates: [],
};
```

Buat file `frontend/src/app/admin/page.tsx`:

```typescript
import { AdminPanel } from "@/features/voting/components/admin-panel"
import { election } from "@/features/voting/election-data"

export default function AdminPage() {
  return <AdminPanel election={election} />
}
```

Salin file-file ini dari repositori lama **persis sama** (tidak ada perubahan):

- `frontend/src/app/layout.tsx`
- `frontend/src/app/globals.css`
- `frontend/next.config.ts`
- `frontend/tsconfig.json`
- `frontend/postcss.config.mjs`
- `frontend/components.json`

---

## BAGIAN 3 — SCRIPT OTOMATISASI

### Untuk Windows

Buat file `start-backend.bat` di root `cryptovote/`:

```bat
@echo off
echo Starting CryptoVote Backend (Python/FastAPI)...
cd backend
call venv\Scripts\activate
uvicorn main:app --reload --port 8000
pause
```

Buat file `start-frontend.bat` di root `cryptovote/`:

```bat
@echo off
echo Starting CryptoVote Frontend (Next.js)...
cd frontend
npm run dev
pause
```

### Untuk Mac/Linux

Buat file `start-backend.sh`:

```bash
#!/bin/bash
echo "Starting CryptoVote Backend..."
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Buat file `start-frontend.sh`:

```bash
#!/bin/bash
echo "Starting CryptoVote Frontend..."
cd frontend
npm run dev
```

Beri izin eksekusi:

```bash
chmod +x start-backend.sh start-frontend.sh
```

---

## BAGIAN 4 — README.md

Buat file `README.md` di root `cryptovote/`:

````markdown
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
````

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

```

---

## BAGIAN 5 — URUTAN PENGERJAAN

Ikuti urutan ini agar tidak ada yang terlewat:

```

1.  Buat folder root cryptovote/
2.  Buat folder backend/ dan setup venv
3.  Buat requirements.txt dan install
4.  Buat .env dari .env.example
5.  Buat elgamal_utils.py
6.  Buat models/**init**.py dan models/schemas.py
7.  Buat store/**init**.py dan store/election_store.py
8.  Buat routes/**init**.py
9.  Buat routes/health.py
10. Buat routes/election.py
11. Buat routes/admin.py
12. Buat main.py
13. Test backend: uvicorn main:app --reload --port 8000
14. Cek http://localhost:8000/docs → semua endpoint harus muncul
15. Buat folder frontend/ dengan create-next-app
16. Install dependencies frontend
17. Buat .env.local dari .env.local.example
18. Buat src/lib/api-client.ts
19. Salin src/lib/elgamal.ts dari repo lama
20. Salin src/features/voting/types.ts dari repo lama
21. Salin src/features/voting/tally.ts dari repo lama
22. Salin src/components/ui/\*.tsx dari repo lama
23. Buat src/lib/utils.ts
24. Buat src/features/voting/election-data.ts
25. Salin & modifikasi crypto-vote-app.tsx (ubah URL fetch)
26. Salin & modifikasi admin-panel.tsx (ubah URL fetch)
27. Buat src/app/page.tsx dan src/app/admin/page.tsx
28. Salin layout.tsx, globals.css, next.config.ts, tsconfig.json
29. Test frontend: npm run dev
30. Buat script .bat/.sh
31. Buat README.md

````

---

## BAGIAN 6 — VERIFIKASI AKHIR

Setelah semua selesai, lakukan pengecekan berikut:

**Backend:**

```bash
curl http://localhost:8000/api/health
# Harusnya: {"status":"ok","service":"cryptovote",...}

curl http://localhost:8000/api/admin/election
# Harusnya: {"election":{...},"history":[],"persistence":"local-file"}
````

**Frontend + Backend terintegrasi:**

1. Buka `http://localhost:3000/admin`
2. Login dengan `admin@kampus.test` / `admin123`
3. Isi judul, region, deskripsi pemilihan
4. Tambah minimal 2 kandidat
5. Tambah minimal 1 pemilih ke DPT
6. Klik **Mulai Pemilihan**
7. Buka `http://localhost:3000`
8. Masukkan identifier pemilih → klik **Cek DPT**
9. Pilih kandidat → klik **Kunci dan Kirim Suara**
10. Salin token receipt → tempel ke panel verifikasi → klik **Verifikasi**
11. Kembali ke `/admin` → **Tutup Pemilihan** → **Dekripsi Tally Agregat**
12. Hasil suara harus muncul dengan benar

---

_Dokumen ini mencakup semua yang diperlukan untuk membangun CryptoVote dari nol dengan arsitektur Frontend Next.js + Backend Python FastAPI._
