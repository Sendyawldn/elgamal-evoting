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
