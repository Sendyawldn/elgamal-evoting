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
