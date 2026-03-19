import { describe, it, expect } from 'vitest';
import { normalizeHex, parseHex, bytesToHex } from '../hex';

describe('normalizeHex', () => {
  it('strips 0x prefix and lowercases', () => {
    expect(normalizeHex('0xABCDEF')).toBe('abcdef');
  });

  it('lowercases without prefix', () => {
    expect(normalizeHex('ABCDEF')).toBe('abcdef');
  });

  it('rejects empty string', () => {
    expect(() => normalizeHex('')).toThrow('Invalid hex characters');
  });

  it('rejects 0x with nothing after', () => {
    expect(() => normalizeHex('0x')).toThrow('Invalid hex characters');
  });

  it('rejects invalid characters', () => {
    expect(() => normalizeHex('xyz123')).toThrow('Invalid hex characters');
  });

  it('accepts valid lowercase hex', () => {
    expect(normalizeHex('deadbeef')).toBe('deadbeef');
  });
});

describe('parseHex', () => {
  it('roundtrips with bytesToHex', () => {
    const hex = 'abcdef0123456789';
    const bytes = parseHex(hex);
    expect(bytesToHex(bytes)).toBe(hex);
  });

  it('handles 0x prefix', () => {
    const bytes = parseHex('0xabcdef');
    expect(bytesToHex(bytes)).toBe('abcdef');
  });

  it('handles uppercase input', () => {
    const bytes = parseHex('ABCDEF');
    expect(bytesToHex(bytes)).toBe('abcdef');
  });
});
