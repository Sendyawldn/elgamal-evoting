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
        "election": saved["election"],
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
