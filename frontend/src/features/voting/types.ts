import type { EncryptedVoteChoice } from "@/lib/elgamal-vote"

export type Candidate = {
  id: string
  name: string
  party: string
  color: string
  platform: string
  votes: number
}

export type ElectionStatus = "draft" | "open" | "closed"

export type Voter = {
  id: string
  email: string
  identifier: string
  name?: string
  hasVoted: boolean
  votedAt?: string
}

export type AdminUser = {
  id: string
  email: string
  role: "admin"
}

export type Election = {
  id: string
  title: string
  description: string
  region: string
  closesAt: string
  status: ElectionStatus
  totalVoters: number
  ballotsCast: number
  authorizedVoters: Voter[]
  admins: AdminUser[]
  candidates: Candidate[]
}

export type VoteReceipt = {
  candidateId: string
  encryptedBallot: string
  verificationToken: string
  receiptHash: string
  encryptedChoices: EncryptedVoteChoice[]
  proofLabel: string
  createdAt: string
}
