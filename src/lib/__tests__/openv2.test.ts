import { describe, it, expect } from 'vitest';
import { deriveUserKey, deriveClientSeedHash } from '@riprip-io/provably-fair';
import {
  QUICKNET_GENESIS_TIME,
  QUICKNET_PERIOD_SECONDS,
  roundForTimestamp,
  roundPublishTime,
  buildMessageV2,
  resolveOpenBatchV2,
  verifyBeaconSha256,
  verifyBeaconBLS,
  checkEntropy,
} from '../openv2';
import { parseHex, bytesToHex } from '../hex';

// ── Frozen cross-implementation vectors ─────────────────────
// These MUST match packages/provably-fair/src/__fixtures__/test-vectors-v2.ts
// in the riprip monorepo. If either side changes, the protocol broke.

const SERVER_SECRET = new Uint8Array(32).fill(0x01);
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_SEED = 'my-client-seed';
const EPOCH_ID = 20260210;
const PURCHASE_NONCE = 42n;
const PACK_CONFIG_HASH = new Uint8Array(32).fill(0xbb);
const DRAW_TABLES = [
  {
    drawId: 0,
    drawsPerOpen: 3,
    items: [
      { sku: 'COMMON', weight: 700 },
      { sku: 'UNCOMMON', weight: 200 },
      { sku: 'RARE', weight: 100 },
    ],
  },
];

// Real quicknet round 1000 + frozen goldens — shared fixture module.
import {
  V2_DRAND_ROUND as DRAND_ROUND,
  V2_DRAND_RANDOMNESS_HEX as DRAND_RANDOMNESS,
  V2_DRAND_SIGNATURE_HEX as DRAND_SIGNATURE,
  V2_EXPECTED_MESSAGE_HEX as EXPECTED_MESSAGE_V2_HEX,
  V2_EXPECTED_DRAWS as EXPECTED_DRAWS_V2,
} from '../__fixtures__/openv2-vectors';

describe('roundForTimestamp', () => {
  it('returns round 2 for the genesis timestamp (strictly after)', () => {
    expect(roundForTimestamp(QUICKNET_GENESIS_TIME)).toBe(2);
  });

  it('maps a publish-boundary ts to the next round', () => {
    const ts = QUICKNET_GENESIS_TIME + 10 * QUICKNET_PERIOD_SECONDS;
    expect(roundForTimestamp(ts)).toBe(12);
  });

  it('returned round always publishes strictly after ts', () => {
    for (const delta of [0, 1, 2, 3, 100, 12345]) {
      const ts = QUICKNET_GENESIS_TIME + delta;
      const round = roundForTimestamp(ts);
      expect(roundPublishTime(round)).toBeGreaterThan(ts);
      expect(roundPublishTime(round - 1)).toBeLessThanOrEqual(ts);
    }
  });

  it('rejects pre-genesis timestamps', () => {
    expect(() => roundForTimestamp(QUICKNET_GENESIS_TIME - 1)).toThrow();
  });
});

describe('buildMessageV2 (frozen vector)', () => {
  it('reproduces the monorepo golden 162-byte message', () => {
    const msg = buildMessageV2(
      {
        epochId: EPOCH_ID,
        userKey: deriveUserKey(USER_ID),
        purchaseNonce: PURCHASE_NONCE,
        packConfigHash: PACK_CONFIG_HASH,
        openIndex: 0,
        drawIndex: 0,
        clientSeedHash: deriveClientSeedHash(CLIENT_SEED),
      },
      { drandRound: DRAND_ROUND, drandRandomness: parseHex(DRAND_RANDOMNESS) },
    );
    expect(msg.length).toBe(162);
    expect(bytesToHex(msg)).toBe(EXPECTED_MESSAGE_V2_HEX);
  });
});

describe('resolveOpenBatchV2 (frozen vector)', () => {
  it('reproduces the monorepo golden draw outcomes', () => {
    const batch = resolveOpenBatchV2(
      SERVER_SECRET,
      EPOCH_ID,
      deriveUserKey(USER_ID),
      PURCHASE_NONCE,
      PACK_CONFIG_HASH,
      deriveClientSeedHash(CLIENT_SEED),
      { drandRound: DRAND_ROUND, drandRandomness: parseHex(DRAND_RANDOMNESS) },
      1,
      DRAW_TABLES,
    );
    expect(batch.results).toHaveLength(1);
    const draws = batch.results[0].draws;
    expect(draws).toHaveLength(3);
    for (let i = 0; i < EXPECTED_DRAWS_V2.length; i++) {
      expect(draws[i].drawIndex).toBe(EXPECTED_DRAWS_V2[i].drawIndex);
      expect(draws[i].ticket).toBe(EXPECTED_DRAWS_V2[i].ticket);
      expect(draws[i].selectedItem).toBe(EXPECTED_DRAWS_V2[i].selectedItem);
    }
  });
});

describe('beacon verification (real quicknet round 1000)', () => {
  it('sha256(signature) == randomness', () => {
    expect(verifyBeaconSha256(parseHex(DRAND_SIGNATURE), parseHex(DRAND_RANDOMNESS))).toBe(true);
  });

  it('rejects tampered randomness', () => {
    const bad = parseHex(DRAND_RANDOMNESS);
    bad[0] ^= 1;
    expect(verifyBeaconSha256(parseHex(DRAND_SIGNATURE), bad)).toBe(false);
  });

  it('BLS-verifies the real signature against the quicknet group key', () => {
    expect(verifyBeaconBLS(DRAND_ROUND, parseHex(DRAND_SIGNATURE))).toBe(true);
  });

  it('BLS rejects a tampered signature', () => {
    const bad = parseHex(DRAND_SIGNATURE);
    bad[5] ^= 1;
    expect(verifyBeaconBLS(DRAND_ROUND, bad)).toBe(false);
  });

  it('BLS rejects the right signature for the wrong round', () => {
    expect(verifyBeaconBLS(DRAND_ROUND + 1, parseHex(DRAND_SIGNATURE))).toBe(false);
  });

  it('BLS rejects a fabricated self-consistent beacon (the forgery quorum defends against)', () => {
    // Anyone can invent a signature and sha256 it — only BLS proves origin.
    const forged = new Uint8Array(48).fill(0xab);
    const forgedRandomness = parseHex(DRAND_RANDOMNESS); // irrelevant here
    expect(verifyBeaconSha256(forged, forgedRandomness)).toBe(false);
    expect(verifyBeaconBLS(DRAND_ROUND, forged)).toBe(false);
  });
});

describe('checkEntropy (combined)', () => {
  // entropyTs = publish time of round 999 → round rule derives exactly 1000.
  const ENTROPY_TS = QUICKNET_GENESIS_TIME + 998 * QUICKNET_PERIOD_SECONDS;

  it('passes for a fully consistent real beacon', () => {
    const res = checkEntropy({
      entropyTs: ENTROPY_TS,
      drandRound: DRAND_ROUND,
      drandRandomness: parseHex(DRAND_RANDOMNESS),
      drandSignature: parseHex(DRAND_SIGNATURE),
    });
    expect(res).toMatchObject({
      roundRuleValid: true,
      expectedRound: 1000,
      sha256Valid: true,
      blsValid: true,
      valid: true,
    });
  });

  it('fails (not throws) the round rule for a pre-genesis timestamp', () => {
    const res = checkEntropy({
      entropyTs: 1_000_000_000, // long before quicknet genesis
      drandRound: DRAND_ROUND,
      drandRandomness: parseHex(DRAND_RANDOMNESS),
      drandSignature: parseHex(DRAND_SIGNATURE),
    });
    expect(res.roundRuleValid).toBe(false);
    expect(res.valid).toBe(false);
    // The genuine beacon still passes its own checks — only the rule fails.
    expect(res.sha256Valid).toBe(true);
  });

  it('fails the round rule when the stored round does not match the ts', () => {
    const res = checkEntropy({
      entropyTs: ENTROPY_TS,
      drandRound: DRAND_ROUND - 1,
      drandRandomness: parseHex(DRAND_RANDOMNESS),
      drandSignature: parseHex(DRAND_SIGNATURE),
    });
    expect(res.roundRuleValid).toBe(false);
    expect(res.valid).toBe(false);
  });
});
