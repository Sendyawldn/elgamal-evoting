import type { Election, VoteReceipt } from "./types"
import { createEncryptedVoteReceipt } from "@/lib/elgamal-vote"
import type { ElGamalPublicKey } from "@/lib/elgamal"

export function getTurnoutPercentage(ballotsCast: number, totalVoters: number) {
  if (totalVoters <= 0) {
    return 0
  }

  return Math.round((ballotsCast / totalVoters) * 100)
}

export function getCandidatePercent(votes: number, ballotsCast: number) {
  if (ballotsCast <= 0) {
    return 0
  }

  return Number(((votes / ballotsCast) * 100).toFixed(1))
}

export function getElectionResults(election: Election) {
  return {
    electionId: election.id,
    title: election.title,
    totalVoters: election.totalVoters,
    ballotsCast: election.ballotsCast,
    status: election.status,
    authorizedVoters: election.authorizedVoters.length,
    turnoutPercentage: getTurnoutPercentage(election.ballotsCast, election.totalVoters),
    verificationStatus: "demo-elgamal",
    candidates: election.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      party: candidate.party,
      votes: candidate.votes,
      percent: getCandidatePercent(candidate.votes, election.ballotsCast)
    }))
  }
}

export function createReceipt(
  candidateId: string,
  candidateIds: string[],
  timestamp = new Date(),
  publicKey?: ElGamalPublicKey
): VoteReceipt {
  const encryptedReceipt = createEncryptedVoteReceipt({
    candidateIds,
    selectedCandidateId: candidateId,
    publicKey,
    timestamp
  })

  return {
    candidateId,
    encryptedBallot: encryptedReceipt.shortCode,
    verificationToken: encryptedReceipt.token,
    receiptHash: encryptedReceipt.receiptHash,
    encryptedChoices: encryptedReceipt.encryptedChoices,
    proofLabel: "El Gamal ciphertext vector",
    createdAt: encryptedReceipt.createdAt
  }
}

export function applyLocalVote(election: Election, candidateId: string): Election {
  return {
    ...election,
    ballotsCast: election.ballotsCast + 1,
    candidates: election.candidates.map((candidate) =>
      candidate.id === candidateId
        ? { ...candidate, votes: candidate.votes + 1 }
        : candidate
    )
  }
}
