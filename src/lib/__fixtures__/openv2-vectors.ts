/**
 * OPENv2 frozen reference vectors — single source for the browser self-test
 * banner and the vitest suites.
 *
 * MUST match packages/provably-fair/src/__fixtures__/test-vectors-v2.ts in
 * the riprip monorepo. The beacon values are REAL drand quicknet round 1000,
 * independently fetchable from any relay:
 *   https://api.drand.sh/52db9ba7…c84e971/public/1000
 */

export const V2_DRAND_ROUND = 1000;
export const V2_DRAND_RANDOMNESS_HEX =
  'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd';
export const V2_DRAND_SIGNATURE_HEX =
  'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39';

/** Shared OPENv1/v2 fixture inputs (identical to the monorepo goldens). */
export const V2_FIXTURE_INPUTS = {
  serverSecretFill: 0x01, // 32 bytes of 0x01
  userId: '550e8400-e29b-41d4-a716-446655440000',
  clientSeed: 'my-client-seed',
  epochId: 20260210,
  purchaseNonce: 42n,
  packConfigHashFill: 0xbb, // 32 bytes of 0xbb
} as const;

/** Frozen 162-byte OPENv2 message for openIndex=0, drawIndex=0. */
export const V2_EXPECTED_MESSAGE_HEX =
  '4f50454e763272253501667949508eea84730f4bdb93f470c0ae37964b8d0e8a29775e5d77d81bec4e062a00000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00000000000000006a5ab24eb2b06bf8c45078e754eb80b0a5705db46875a379fe3e454bcd9d171ce803000000000000fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd';

/** Frozen resolveOpenBatchV2 outcomes for the fixtures above. */
export const V2_EXPECTED_DRAWS = [
  { drawIndex: 0, ticket: 499169, selectedItem: 'COMMON' },
  { drawIndex: 1, ticket: 811907, selectedItem: 'COMMON' },
  { drawIndex: 2, ticket: 555714, selectedItem: 'COMMON' },
] as const;

export const V2_FIXTURE_DRAW_TABLES = [
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
