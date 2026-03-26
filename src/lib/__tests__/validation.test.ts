import { describe, it, expect } from 'vitest';
import { isValidUUID, isValidHex64, isPositiveInteger, isNonNegativeInteger, validateDrawTablesJSON, MAX_QUANTITY } from '../validation';

describe('isValidUUID', () => {
  it('accepts valid UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('accepts uppercase UUID', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects invalid UUID', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });
});

describe('isValidHex64', () => {
  const valid64 = 'a'.repeat(64);

  it('accepts 64 hex chars', () => {
    expect(isValidHex64(valid64)).toBe(true);
  });

  it('accepts with 0x prefix', () => {
    expect(isValidHex64('0x' + valid64)).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidHex64('a'.repeat(63))).toBe(false);
    expect(isValidHex64('a'.repeat(65))).toBe(false);
  });

  it('rejects invalid chars', () => {
    expect(isValidHex64('g'.repeat(64))).toBe(false);
  });
});

describe('isPositiveInteger', () => {
  it('accepts "1"', () => expect(isPositiveInteger('1')).toBe(true));
  it('accepts "100"', () => expect(isPositiveInteger('100')).toBe(true));
  it('rejects "0"', () => expect(isPositiveInteger('0')).toBe(false));
  it('rejects "-1"', () => expect(isPositiveInteger('-1')).toBe(false));
  it('rejects "1.5"', () => expect(isPositiveInteger('1.5')).toBe(false));
  it('rejects empty', () => expect(isPositiveInteger('')).toBe(false));
});

describe('isNonNegativeInteger', () => {
  it('accepts "0"', () => expect(isNonNegativeInteger('0')).toBe(true));
  it('accepts "42"', () => expect(isNonNegativeInteger('42')).toBe(true));
  it('rejects "-1"', () => expect(isNonNegativeInteger('-1')).toBe(false));
  it('rejects "1.5"', () => expect(isNonNegativeInteger('1.5')).toBe(false));
  it('rejects empty', () => expect(isNonNegativeInteger('')).toBe(false));
});

describe('MAX_QUANTITY', () => {
  it('is 100', () => expect(MAX_QUANTITY).toBe(100));
});

describe('validateDrawTablesJSON', () => {
  const validTable = JSON.stringify([
    {
      drawId: 0,
      drawsPerOpen: 1,
      items: [{ sku: 'SKU-001', weight: 100 }],
    },
  ]);

  it('accepts valid draw tables', () => {
    const result = validateDrawTablesJSON(validTable);
    expect(result.valid).toBe(true);
    expect(result.tables).toHaveLength(1);
  });

  it('rejects non-array', () => {
    const result = validateDrawTablesJSON('{}');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('array');
  });

  it('rejects missing drawId', () => {
    const result = validateDrawTablesJSON(JSON.stringify([{ drawsPerOpen: 1, items: [{ sku: 's', weight: 1 }] }]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('drawId');
  });

  it('rejects drawsPerOpen < 1', () => {
    const result = validateDrawTablesJSON(JSON.stringify([{ drawId: 0, drawsPerOpen: 0, items: [{ sku: 's', weight: 1 }] }]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('drawsPerOpen');
  });

  it('rejects empty items', () => {
    const result = validateDrawTablesJSON(JSON.stringify([{ drawId: 0, drawsPerOpen: 1, items: [] }]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  it('rejects invalid sku', () => {
    const result = validateDrawTablesJSON(JSON.stringify([{ drawId: 0, drawsPerOpen: 1, items: [{ sku: '', weight: 1 }] }]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('sku');
  });

  it('rejects non-integer weight', () => {
    const result = validateDrawTablesJSON(JSON.stringify([{ drawId: 0, drawsPerOpen: 1, items: [{ sku: 's', weight: 1.5 }] }]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('weight');
  });

  it('rejects weight < 1', () => {
    const result = validateDrawTablesJSON(JSON.stringify([{ drawId: 0, drawsPerOpen: 1, items: [{ sku: 's', weight: 0 }] }]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('weight');
  });

  it('accepts large weights', () => {
    const result = validateDrawTablesJSON(JSON.stringify([{ drawId: 0, drawsPerOpen: 1, items: [{ sku: 's', weight: 97_000_000 }] }]));
    expect(result.valid).toBe(true);
  });

  it('rejects invalid JSON', () => {
    const result = validateDrawTablesJSON('not json');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });
});
