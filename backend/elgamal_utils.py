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
