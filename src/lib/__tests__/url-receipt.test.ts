import { describe, it, expect } from 'vitest';
import { decodeBase64Json, loadReceiptFromSearch } from '../url-receipt';

const validReceipt = {
  version: 1,
  serverSecret: 'a'.repeat(64),
  commitHash: 'b'.repeat(64),
  epochId: 20260420,
  userId: '550e8400-e29b-41d4-a716-446655440000',
  clientSeed: 'd'.repeat(64),
  purchaseNonce: 7,
  packConfigHash: 'c'.repeat(64),
  quantity: 1,
  drawTables: [
    {
      drawId: 0,
      drawsPerOpen: 1,
      items: [{ sku: 'COMMON', weight: 100 }],
    },
  ],
};

function b64(json: unknown): string {
  return btoa(JSON.stringify(json));
}

function b64url(json: unknown): string {
  // RFC 4648 §5 URL-safe alphabet, no padding.
  return b64(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('loadReceiptFromSearch', () => {
  it('reports absence when no ?receipt param is present', () => {
    const out = loadReceiptFromSearch('?other=1');
    expect(out.present).toBe(false);
    expect(out.validation).toBeUndefined();
  });

  it('decodes a standard-base64 receipt and runs it through parseReceipt', () => {
    const out = loadReceiptFromSearch(`?receipt=${encodeURIComponent(b64(validReceipt))}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(true);
    expect(out.validation?.receipt?.serverSecret).toBe(validReceipt.serverSecret);
    expect(out.validation?.receipt?.epochId).toBe(20260420);
  });

  it('decodes a URL-safe (base64url) receipt with stripped padding', () => {
    const out = loadReceiptFromSearch(`?receipt=${b64url(validReceipt)}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(true);
    expect(out.validation?.receipt?.userId).toBe(validReceipt.userId);
  });

  it('flags malformed base64 with a clear error', () => {
    const out = loadReceiptFromSearch('?receipt=%21%21%21not-base64%21%21%21');
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
    expect(out.validation?.error?.toLowerCase()).toContain('base64');
  });

  it('flags valid base64 of invalid JSON', () => {
    const out = loadReceiptFromSearch(`?receipt=${btoa('not json')}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
  });

  it('flags valid JSON that fails receipt validation', () => {
    const out = loadReceiptFromSearch(
      `?receipt=${b64({ ...validReceipt, version: 99 })}`,
    );
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
    expect(out.validation?.error?.toLowerCase()).toContain('version');
  });

  it('flags an empty ?receipt= value', () => {
    const out = loadReceiptFromSearch('?receipt=');
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
    expect(out.validation?.error?.toLowerCase()).toContain('empty');
  });
});

describe('decodeBase64Json', () => {
  it('round-trips a standard base64 JSON string', () => {
    expect(decodeBase64Json(btoa('{"a":1}'))).toBe('{"a":1}');
  });

  it('round-trips URL-safe base64 with - and _', () => {
    // 0xFF 0xFE 0xFD → "//79" in standard, "__79" in URL-safe (here we
    // construct a payload whose padding-stripped form has both - and _).
    const payload = '{"x":"hello world"}';
    const std = btoa(payload);
    const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(decodeBase64Json(urlSafe)).toBe(payload);
  });

  it('rejects empty input', () => {
    expect(() => decodeBase64Json('')).toThrow(/empty/i);
  });
});
