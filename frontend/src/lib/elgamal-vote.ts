import {
  decrypt,
  deserializeCiphertext,
  encryptExponentVote,
  generateKeyPair,
  multiplyCiphertexts,
  serializeCiphertext,
  serializePublicKey,
  type ElGamalCiphertext,
  type ElGamalPublicKey
} from "./elgamal"

export type EncryptedVoteChoice = {
  candidateId: string
  ciphertext: ReturnType<typeof serializeCiphertext>
}

export type EncryptedVoteTokenPayload = {
  version: 1
  createdAt: string
  publicKey: ReturnType<typeof serializePublicKey>
  choices: EncryptedVoteChoice[]
  receiptHash: string
}

export type EncryptedVoteReceipt = {
  token: string
  receiptHash: string
  shortCode: string
  createdAt: string
  encryptedChoices: EncryptedVoteChoice[]
}

export type VoteLedgerEntry = {
  receiptHash: string
  token: string
  createdAt: string
  candidateId?: string
  voterName?: string
  encryptedChoices: EncryptedVoteChoice[]
}

export type VoteVerificationResult =
  | {
      status: "verified"
      receiptHash: string
      message: string
    }
  | {
      status: "invalid"
      message: string
    }

const DEMO_PRIVATE_EXPONENT = "91236781236781236781236781236781"
const ELECTION_PRIVATE_KEY = generateKeyPair(undefined, getElectionPrivateExponent())

export const DEMO_PUBLIC_KEY = ELECTION_PRIVATE_KEY.publicKey

export function createEncryptedVoteReceipt({
  candidateIds,
  selectedCandidateId,
  publicKey = DEMO_PUBLIC_KEY,
  timestamp = new Date()
}: {
  candidateIds: string[]
  selectedCandidateId: string
  publicKey?: ElGamalPublicKey
  timestamp?: Date
}): EncryptedVoteReceipt {
  if (!candidateIds.includes(selectedCandidateId)) {
    throw new Error("Selected candidate is not part of this election")
  }

  const createdAt = timestamp.toISOString()
  const encryptedChoices = candidateIds.map((candidateId) => ({
    candidateId,
    ciphertext: serializeCiphertext(
      encryptExponentVote(candidateId === selectedCandidateId ? 1 : 0, publicKey)
    )
  }))
  const receiptHash = createReceiptHash(createdAt, encryptedChoices)
  const payload: EncryptedVoteTokenPayload = {
    version: 1,
    createdAt,
    publicKey: serializePublicKey(publicKey),
    choices: encryptedChoices,
    receiptHash
  }

  return {
    token: `EGV1.${encodeJson(payload)}`,
    receiptHash,
    shortCode: `EG-${receiptHash.slice(0, 18).toUpperCase()}`,
    createdAt,
    encryptedChoices
  }
}

export function createLedgerEntry(
  receipt: EncryptedVoteReceipt,
  candidateId: string
): VoteLedgerEntry {
  return {
    receiptHash: receipt.receiptHash,
    token: receipt.token,
    createdAt: receipt.createdAt,
    candidateId,
    encryptedChoices: receipt.encryptedChoices
  }
}

export function verifyVoteToken(
  token: string,
  ledger: VoteLedgerEntry[]
): VoteVerificationResult {
  const payload = parseVoteToken(token)

  if (!payload) {
    return {
      status: "invalid",
      message: "Token tidak valid atau formatnya bukan EGV1."
    }
  }

  const receiptHash = createReceiptHash(payload.createdAt, payload.choices)

  if (receiptHash !== payload.receiptHash) {
    return {
      status: "invalid",
      message: "Hash token tidak cocok dengan ciphertext."
    }
  }

  const entry = ledger.find((item) => item.receiptHash === payload.receiptHash)

  if (!entry) {
    return {
      status: "invalid",
      message: "Token belum ditemukan di ledger hitung lokal."
    }
  }

  return {
    status: "verified",
    receiptHash: payload.receiptHash,
    message: "Token valid dan ciphertext-nya sudah masuk agregasi. Pilihan tetap tidak dibuka."
  }
}

export function aggregateEncryptedChoices(entries: VoteLedgerEntry[]) {
  const totals = new Map<string, ElGamalCiphertext>()

  for (const entry of entries) {
    for (const choice of entry.encryptedChoices) {
      const ciphertext = deserializeCiphertext(choice.ciphertext)
      const existing = totals.get(choice.candidateId)
      totals.set(
        choice.candidateId,
        existing
          ? multiplyCiphertexts(existing, ciphertext, DEMO_PUBLIC_KEY)
          : ciphertext
      )
    }
  }

  return totals
}

export function decryptAggregatedVote(
  aggregate: ElGamalCiphertext,
  maximumVotes: number
) {
  const encodedTotal = decrypt(aggregate, ELECTION_PRIVATE_KEY)
  let cursor = 1n

  for (let voteCount = 0; voteCount <= maximumVotes; voteCount += 1) {
    if (cursor === encodedTotal) {
      return voteCount
    }

    cursor = (cursor * DEMO_PUBLIC_KEY.g) % DEMO_PUBLIC_KEY.p
  }

  throw new Error("Aggregate vote count is outside the demo search range")
}

export function parseVoteToken(token: string): EncryptedVoteTokenPayload | null {
  if (!token.startsWith("EGV1.")) {
    return null
  }

  try {
    const decoded = decodeJson(token.slice("EGV1.".length)) as EncryptedVoteTokenPayload

    if (
      decoded.version !== 1 ||
      typeof decoded.createdAt !== "string" ||
      typeof decoded.receiptHash !== "string" ||
      !Array.isArray(decoded.choices)
    ) {
      return null
    }

    return decoded
  } catch {
    return null
  }
}

function createReceiptHash(createdAt: string, choices: EncryptedVoteChoice[]) {
  const canonical = JSON.stringify({
    createdAt,
    choices: choices.map((choice) => ({
      candidateId: choice.candidateId,
      c1: choice.ciphertext.c1,
      c2: choice.ciphertext.c2
    }))
  })
  let hash = 0xcbf29ce484222325n

  for (const char of canonical) {
    hash ^= BigInt(char.codePointAt(0) ?? 0)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }

  return hash.toString(16).padStart(16, "0")
}

function encodeJson(value: unknown) {
  return btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function decodeJson(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=")
  return JSON.parse(atob(padded.replaceAll("-", "+").replaceAll("_", "/")))
}

function getElectionPrivateExponent() {
  const configuredExponent =
    typeof process !== "undefined"
      ? process.env.ELECTION_PRIVATE_KEY?.trim()
      : undefined
  const exponent = configuredExponent || DEMO_PRIVATE_EXPONENT

  try {
    const parsed = BigInt(exponent)

    if (parsed <= 1n) {
      throw new Error("Private key must be greater than 1")
    }

    return parsed
  } catch {
    if (configuredExponent) {
      throw new Error("ELECTION_PRIVATE_KEY must be a decimal BigInt string")
    }

    return BigInt(DEMO_PRIVATE_EXPONENT)
  }
}
