/**
 * OPENv2 verification (RIP-996 / RIP-1010).
 *
 * OPENv2 extends the OPENv1 message with drand quicknet public-beacon
 * entropy so the epoch server secret alone cannot pre-compute an outcome.
 * Spec: docs/rng-v2.md in the riprip monorepo.
 *
 * The v2 message/resolve helpers here are composed from the PUBLISHED
 * @riprip-io/provably-fair@0.2.0 primitives (buildMessage, generateTicket,
 * selectWeighted). TODO(RIP-1012): once @riprip-io/provably-fair@>=0.3.0 is
 * published with buildMessageV2 / resolveOpenBatchV2 / quicknet constants,
 * replace these local copies with the package exports. The protocol values
 * below are FROZEN (pinned by golden vectors on both sides), so drift is
 * detectable by the self-tests, not silent.
 */

import {
  buildMessage,
  generateTicket,
  selectWeighted,
  type DrawInput,
  type DrawTable,
  type OpenBatchResult,
  type OpenResult,
  type DrawResult,
} from '@riprip-io/provably-fair';
import { bls12_381 } from '@noble/curves/bls12-381.js';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes } from '@noble/hashes/utils';

// ── drand quicknet chain parameters (FROZEN protocol constants) ──

export const QUICKNET_CHAIN_HASH =
  '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
export const QUICKNET_GENESIS_TIME = 1692803367;
export const QUICKNET_PERIOD_SECONDS = 3;
/** BLS12-381 G2 group public key (scheme bls-unchained-g1-rfc9380). */
export const QUICKNET_PUBLIC_KEY =
  '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a';

const TAG_V2 = new TextEncoder().encode('OPENv2'); // 6 bytes

// Parsed once at module scope — the group key is a fixed protocol constant
// and G2 decompression is not free.
const QUICKNET_PUBLIC_KEY_BYTES = hexToBytes(QUICKNET_PUBLIC_KEY);

/** Unix seconds at which a given quicknet round is published. */
export function roundPublishTime(round: number): number {
  return QUICKNET_GENESIS_TIME + (round - 1) * QUICKNET_PERIOD_SECONDS;
}

/**
 * The OPENv2 round rule: the first quicknet round published STRICTLY AFTER
 * the given unix-seconds timestamp.
 */
export function roundForTimestamp(tsSeconds: number): number {
  if (!Number.isInteger(tsSeconds) || tsSeconds < QUICKNET_GENESIS_TIME) {
    throw new Error('timestamp must be an integer ≥ quicknet genesis');
  }
  return Math.floor((tsSeconds - QUICKNET_GENESIS_TIME) / QUICKNET_PERIOD_SECONDS) + 2;
}

// ── OPENv2 message + resolution ──

export interface EntropyInput {
  drandRound: number;
  /** 32 bytes. */
  drandRandomness: Uint8Array;
}

/**
 * Build the 162-byte OPENv2 message: the OPENv1 layout with the tag swapped
 * to "OPENv2" plus le64(drand_round) and drand_randomness(32) appended.
 */
export function buildMessageV2(input: DrawInput, entropy: EntropyInput): Uint8Array {
  if (entropy.drandRandomness.length !== 32) {
    throw new Error('drandRandomness must be 32 bytes');
  }
  const v1 = buildMessage(input); // 122 bytes, includes 32-byte field validation
  const bytes = new Uint8Array(v1.length + 8 + 32);
  bytes.set(v1, 0);
  bytes.set(TAG_V2, 0); // overwrite the "OPENv1" tag
  new DataView(bytes.buffer).setBigUint64(v1.length, BigInt(entropy.drandRound), true);
  bytes.set(entropy.drandRandomness, v1.length + 8);
  return bytes;
}

/**
 * Resolve a full purchase batch under OPENv2. Mirrors the monorepo's
 * resolveOpenBatchV2: same draw loop and globally unique drawIndex per open
 * as v1, with the v2 message feeding ticket + weighted selection.
 */
export function resolveOpenBatchV2(
  serverSecret: Uint8Array,
  epochId: number,
  userKey: Uint8Array,
  purchaseNonce: bigint,
  packConfigHash: Uint8Array,
  clientSeedHash: Uint8Array,
  entropy: EntropyInput,
  quantityN: number,
  draws: DrawTable[],
): OpenBatchResult {
  const results: OpenResult[] = [];
  for (let openIndex = 0; openIndex < quantityN; openIndex++) {
    const drawResults: DrawResult[] = [];
    let globalDrawIndex = 0;
    for (const table of draws) {
      for (let i = 0; i < table.drawsPerOpen; i++) {
        const drawIndex = globalDrawIndex++;
        const message = buildMessageV2(
          { epochId, userKey, purchaseNonce, packConfigHash, openIndex, drawIndex, clientSeedHash },
          entropy,
        );
        const ticket = generateTicket(serverSecret, message);
        const selection = selectWeighted(serverSecret, message, table.items);
        drawResults.push({
          openIndex,
          drawIndex,
          ticket,
          selectedItem: selection.sku,
          rejectionSamples: selection.retries,
        });
      }
    }
    results.push({ openIndex, draws: drawResults });
  }
  return { results };
}

// ── Beacon verification ──

/** quicknet defines randomness = SHA256(BLS signature). */
export function verifyBeaconSha256(signature: Uint8Array, randomness: Uint8Array): boolean {
  const computed = sha256(signature);
  if (computed.length !== randomness.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ randomness[i];
  return diff === 0;
}

/**
 * Fully trustless check: BLS-verify the round's signature against the fixed
 * quicknet group public key. drand's message for round N is
 * SHA256(be64(N)); the scheme is bls-unchained-g1-rfc9380 (signature on G1,
 * public key on G2) — noble's shortSignatures defaults match its DST.
 */
export function verifyBeaconBLS(round: number, signature: Uint8Array): boolean {
  try {
    const roundBytes = new Uint8Array(8);
    new DataView(roundBytes.buffer).setBigUint64(0, BigInt(round), false); // big-endian
    const msg = sha256(roundBytes);
    const ss = bls12_381.shortSignatures;
    const sigPoint = ss.Signature.fromBytes(signature);
    const msgPoint = ss.hash(msg);
    return ss.verify(sigPoint, msgPoint, QUICKNET_PUBLIC_KEY_BYTES);
  } catch {
    return false;
  }
}

// ── Combined entropy check for the UI ──

export interface EntropyCheckResult {
  /** drandRound === firstRoundAfter(entropyTs). */
  roundRuleValid: boolean;
  expectedRound: number;
  /** randomness === SHA256(signature). */
  sha256Valid: boolean;
  /** signature BLS-verifies against the quicknet group public key. */
  blsValid: boolean;
  /** All three — the beacon is authentic and per-protocol. */
  valid: boolean;
}

export function checkEntropy(params: {
  entropyTs: number;
  drandRound: number;
  drandRandomness: Uint8Array;
  drandSignature: Uint8Array;
}): EntropyCheckResult {
  // A pre-genesis / malformed timestamp is a FAILED round rule, never a
  // throw — the UI must always render the per-check panel.
  let expectedRound = 0;
  let roundRuleValid = false;
  try {
    expectedRound = roundForTimestamp(params.entropyTs);
    roundRuleValid = expectedRound === params.drandRound;
  } catch {
    // expectedRound stays 0 → round rule fails with an obvious sentinel.
  }
  const sha256Valid = verifyBeaconSha256(params.drandSignature, params.drandRandomness);
  const blsValid = verifyBeaconBLS(params.drandRound, params.drandSignature);
  return {
    roundRuleValid,
    expectedRound,
    sha256Valid,
    blsValid,
    valid: roundRuleValid && sha256Valid && blsValid,
  };
}
