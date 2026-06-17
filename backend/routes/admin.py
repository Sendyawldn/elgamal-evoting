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
