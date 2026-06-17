export type ElGamalPublicKey = {
  p: bigint
  g: bigint
  y: bigint
}

export type ElGamalPrivateKey = {
  x: bigint
  publicKey: ElGamalPublicKey
}

export type ElGamalCiphertext = {
  c1: bigint
  c2: bigint
}

export type SerializedElGamalCiphertext = {
  c1: string
  c2: string
}

export type SerializedElGamalPublicKey = {
  p: string
  g: string
  y: string
}

export const DEMO_ELGAMAL_PARAMETERS = {
  p: 170141183460469231731687303715884105727n,
  g: 3n
}

export function modPow(base: bigint, exponent: bigint, modulus: bigint) {
  if (modulus <= 1n) {
    throw new Error("Modulus must be greater than 1")
  }

  let result = 1n
  let currentBase = normalizeMod(base, modulus)
  let currentExponent = exponent

  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) {
      result = (result * currentBase) % modulus
    }

    currentExponent /= 2n
    currentBase = (currentBase * currentBase) % modulus
  }

  return result
}

export function modInverse(value: bigint, modulus: bigint) {
  let oldR = normalizeMod(value, modulus)
  let r = modulus
  let oldS = 1n
  let s = 0n

  while (r !== 0n) {
    const quotient = oldR / r
    ;[oldR, r] = [r, oldR - quotient * r]
    ;[oldS, s] = [s, oldS - quotient * s]
  }

  if (oldR !== 1n) {
    throw new Error("Value has no modular inverse")
  }

  return normalizeMod(oldS, modulus)
}

export function generateKeyPair(
  parameters = DEMO_ELGAMAL_PARAMETERS,
  privateExponent = randomBigIntBetween(2n, parameters.p - 2n)
): ElGamalPrivateKey {
  const publicKey = {
    p: parameters.p,
    g: parameters.g,
    y: modPow(parameters.g, privateExponent, parameters.p)
  }

  return {
    x: privateExponent,
    publicKey
  }
}

export function encrypt(
  message: bigint,
  publicKey: ElGamalPublicKey,
  nonce = randomBigIntBetween(2n, publicKey.p - 2n)
): ElGamalCiphertext {
  if (message < 0n || message >= publicKey.p) {
    throw new Error("Message must be in the El Gamal group modulus range")
  }

  return {
    c1: modPow(publicKey.g, nonce, publicKey.p),
    c2: (message * modPow(publicKey.y, nonce, publicKey.p)) % publicKey.p
  }
}

export function decrypt(ciphertext: ElGamalCiphertext, privateKey: ElGamalPrivateKey) {
  const sharedSecret = modPow(ciphertext.c1, privateKey.x, privateKey.publicKey.p)
  const inverseSecret = modInverse(sharedSecret, privateKey.publicKey.p)

  return (ciphertext.c2 * inverseSecret) % privateKey.publicKey.p
}

export function multiplyCiphertexts(
  left: ElGamalCiphertext,
  right: ElGamalCiphertext,
  publicKey: ElGamalPublicKey
): ElGamalCiphertext {
  return {
    c1: (left.c1 * right.c1) % publicKey.p,
    c2: (left.c2 * right.c2) % publicKey.p
  }
}

export function encryptExponentVote(
  voteValue: 0 | 1,
  publicKey: ElGamalPublicKey,
  nonce?: bigint
) {
  return encrypt(modPow(publicKey.g, BigInt(voteValue), publicKey.p), publicKey, nonce)
}

export function decodeSmallExponent(
  encodedValue: bigint,
  publicKey: ElGamalPublicKey,
  maximum = 10_000
) {
  let cursor = 1n

  for (let exponent = 0; exponent <= maximum; exponent += 1) {
    if (cursor === encodedValue) {
      return exponent
    }

    cursor = (cursor * publicKey.g) % publicKey.p
  }

  throw new Error("Encoded value is outside the configured tally search range")
}

export function serializeCiphertext(
  ciphertext: ElGamalCiphertext
): SerializedElGamalCiphertext {
  return {
    c1: ciphertext.c1.toString(16),
    c2: ciphertext.c2.toString(16)
  }
}

export function deserializeCiphertext(
  ciphertext: SerializedElGamalCiphertext
): ElGamalCiphertext {
  return {
    c1: BigInt(`0x${ciphertext.c1}`),
    c2: BigInt(`0x${ciphertext.c2}`)
  }
}

export function serializePublicKey(
  publicKey: ElGamalPublicKey
): SerializedElGamalPublicKey {
  return {
    p: publicKey.p.toString(16),
    g: publicKey.g.toString(16),
    y: publicKey.y.toString(16)
  }
}

export function deserializePublicKey(
  publicKey: SerializedElGamalPublicKey
): ElGamalPublicKey {
  return {
    p: BigInt(`0x${publicKey.p}`),
    g: BigInt(`0x${publicKey.g}`),
    y: BigInt(`0x${publicKey.y}`)
  }
}

function normalizeMod(value: bigint, modulus: bigint) {
  return ((value % modulus) + modulus) % modulus
}

function randomBigIntBetween(minInclusive: bigint, maxInclusive: bigint) {
  const range = maxInclusive - minInclusive + 1n
  const byteLength = Math.ceil(range.toString(2).length / 8)
  const randomBytes = new Uint8Array(byteLength)
  const cryptoRef = globalThis.crypto

  if (!cryptoRef?.getRandomValues) {
    throw new Error("Secure random source is unavailable")
  }

  let candidate = 0n

  do {
    cryptoRef.getRandomValues(randomBytes)
    candidate = 0n

    for (const byte of randomBytes) {
      candidate = (candidate << 8n) + BigInt(byte)
    }
  } while (candidate >= range)

  return minInclusive + candidate
}
