import { describe, it, expect } from 'vitest';
import { parseReceipt } from '../receipt';
import {
  V2_ENTROPY_TS,
  V2_DRAND_ROUND,
  V2_DRAND_RANDOMNESS_HEX,
  V2_DRAND_SIGNATURE_HEX,
} from '../__fixtures__/openv2-vectors';

function makeValidReceipt(overrides?: Record<string, unknown>) {
  return JSON.stringify({
    version: 1,
    serverSecret: 'a'.repeat(64),
    commitHash: 'b'.repeat(64),
    epochId: 20260210,
    userId: '550e8400-e29b-41d4-a716-446655440000',
    clientSeed: 'my-seed',
    purchaseNonce: 0,
    packConfigHash: 'c'.repeat(64),
    quantity: 1,
    drawTables: [
      {
        drawId: 0,
        drawsPerOpen: 1,
        items: [{ sku: 'SKU-001', weight: 100 }],
      },
    ],
    ...overrides,
  });
}

describe('parseReceipt', () => {
  it('accepts a valid receipt', () => {
    const result = parseReceipt(makeValidReceipt());
    expect(result.valid).toBe(true);
    expect(result.receipt).toBeDefined();
    expect(result.receipt!.version).toBe(1);
  });

  it('rejects invalid JSON', () => {
    const result = parseReceipt('not json');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });

  it('rejects non-object', () => {
    const result = parseReceipt('"hello"');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JSON object');
  });

  it('rejects unknown versions', () => {
    const result = parseReceipt(makeValidReceipt({ version: 3 }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('version');
  });

  // ── OPENv2 (RIP-996 / RIP-1010) ──

  // Single source for the frozen quicknet vectors — these were duplicated
  // by value across three suites.
  const V2_ENTROPY = {
    entropyTs: V2_ENTROPY_TS,
    drandRound: V2_DRAND_ROUND,
    drandRandomness: V2_DRAND_RANDOMNESS_HEX,
    drandSignature: V2_DRAND_SIGNATURE_HEX,
  };

  it('accepts a valid version-2 receipt with entropy fields', () => {
    const result = parseReceipt(makeValidReceipt({ version: 2, ...V2_ENTROPY }));
    expect(result.valid).toBe(true);
    expect(result.receipt!.version).toBe(2);
    expect(result.receipt!.drandRound).toBe(1000);
    expect(result.receipt!.drandSignature).toBe(V2_ENTROPY.drandSignature);
  });

  it('rejects version 2 with a pre-genesis entropyTs', () => {
    const result = parseReceipt(makeValidReceipt({ version: 2, ...V2_ENTROPY, entropyTs: 1000 }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('entropyTs');
  });

  it('reports the bad field (not \'Invalid JSON\') for a non-string drandRandomness', () => {
    const result = parseReceipt(makeValidReceipt({ version: 2, ...V2_ENTROPY, drandRandomness: 12345 }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('drandRandomness');
  });

  it('accepts a 0x-prefixed drandSignature (consistent with other hex fields)', () => {
    const result = parseReceipt(
      makeValidReceipt({ version: 2, ...V2_ENTROPY, drandSignature: '0x' + V2_ENTROPY.drandSignature }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects version 2 without entropyTs', () => {
    const { entropyTs: _omit, ...rest } = V2_ENTROPY;
    const result = parseReceipt(makeValidReceipt({ version: 2, ...rest }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('entropyTs');
  });

  it('rejects version 2 with a malformed drandRandomness', () => {
    const result = parseReceipt(
      makeValidReceipt({ version: 2, ...V2_ENTROPY, drandRandomness: 'zz'.repeat(32) }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('drandRandomness');
  });

  it('rejects version 2 with a wrong-length drandSignature', () => {
    const result = parseReceipt(
      makeValidReceipt({ version: 2, ...V2_ENTROPY, drandSignature: 'ab'.repeat(10) }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('drandSignature');
  });

  it('does not require entropy fields on version 1', () => {
    const result = parseReceipt(makeValidReceipt({}));
    expect(result.valid).toBe(true);
    expect(result.receipt!.drandRound).toBeUndefined();
  });

  it('rejects invalid serverSecret', () => {
    const result = parseReceipt(makeValidReceipt({ serverSecret: 'short' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('serverSecret');
  });

  it('rejects invalid commitHash', () => {
    const result = parseReceipt(makeValidReceipt({ commitHash: 'bad' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('commitHash');
  });

  it('accepts missing commitHash', () => {
    const result = parseReceipt(makeValidReceipt({ commitHash: undefined }));
    expect(result.valid).toBe(true);
  });

  it('rejects invalid userId', () => {
    const result = parseReceipt(makeValidReceipt({ userId: 'not-uuid' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('userId');
  });

  it('rejects missing clientSeed', () => {
    const result = parseReceipt(makeValidReceipt({ clientSeed: '' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('clientSeed');
  });

  it('rejects invalid purchaseNonce', () => {
    const result = parseReceipt(makeValidReceipt({ purchaseNonce: -1 }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('purchaseNonce');
  });

  it('rejects invalid packConfigHash', () => {
    const result = parseReceipt(makeValidReceipt({ packConfigHash: 'short' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('packConfigHash');
  });

  it('rejects quantity < 1', () => {
    const result = parseReceipt(makeValidReceipt({ quantity: 0 }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('quantity');
  });

  it('rejects quantity > 100', () => {
    const result = parseReceipt(makeValidReceipt({ quantity: 101 }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('100');
  });

  it('accepts quantity exactly 100', () => {
    const result = parseReceipt(makeValidReceipt({ quantity: 100 }));
    expect(result.valid).toBe(true);
  });

  it('trims whitespace-padded strings and accepts them', () => {
    const result = parseReceipt(makeValidReceipt({
      serverSecret: '  ' + 'a'.repeat(64) + '  ',
      userId: '  550e8400-e29b-41d4-a716-446655440000  ',
      clientSeed: '  my-seed  ',
      packConfigHash: '  ' + 'c'.repeat(64) + '  ',
    }));
    expect(result.valid).toBe(true);
    expect(result.receipt!.serverSecret).toBe('a'.repeat(64));
    expect(result.receipt!.userId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.receipt!.clientSeed).toBe('my-seed');
    expect(result.receipt!.packConfigHash).toBe('c'.repeat(64));
  });

  it('rejects invalid drawTables', () => {
    const result = parseReceipt(makeValidReceipt({ drawTables: 'not-array' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('drawTables');
  });

  describe('openIndex (RIP-1313)', () => {
    it('accepts a receipt without openIndex — pre-RIP-1313 receipts stay valid', () => {
      const result = parseReceipt(makeValidReceipt());
      expect(result.valid).toBe(true);
      expect(result.receipt?.openIndex).toBeUndefined();
    });

    it('accepts an openIndex inside the batch', () => {
      const result = parseReceipt(makeValidReceipt({ quantity: 5, openIndex: 4 }));
      expect(result.valid).toBe(true);
      expect(result.receipt?.openIndex).toBe(4);
    });

    it('rejects an openIndex the batch does not contain', () => {
      // The draw would not be derivable from this receipt at all.
      const result = parseReceipt(makeValidReceipt({ quantity: 2, openIndex: 2 }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('openIndex');
    });

    it('rejects a non-integer openIndex', () => {
      const result = parseReceipt(makeValidReceipt({ quantity: 5, openIndex: 1.5 }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('openIndex');
    });

    it('rejects a negative openIndex', () => {
      const result = parseReceipt(makeValidReceipt({ quantity: 5, openIndex: -1 }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('openIndex');
    });
  });

});
