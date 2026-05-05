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

/**
 * RIP-773 helper: gzip a string then base64-encode the result. Mirrors
 * what the admintool's `buildPublicVerifierUrl` does at link-build
 * time, so the round-trip in these tests pins the verifier's decoder
 * against the encoder side.
 */
async function gzipB64(json: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  // Same direct-writer pattern as url-receipt.ts gunzip — sidesteps
  // the DOM lib's strict stream-typing for Uint8Array's ArrayBuffer
  // generic.
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  void writer
    .write(bytes as BufferSource)
    .then(() => writer.close())
    .catch(() => {});
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  let binary = '';
  for (const byte of out) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('loadReceiptFromSearch', () => {
  it('reports absence when no ?receipt param is present', async () => {
    const out = await loadReceiptFromSearch('?other=1');
    expect(out.present).toBe(false);
    expect(out.validation).toBeUndefined();
  });

  it('decodes a standard-base64 receipt and runs it through parseReceipt', async () => {
    const out = await loadReceiptFromSearch(
      `?receipt=${encodeURIComponent(b64(validReceipt))}`,
    );
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(true);
    expect(out.validation?.receipt?.serverSecret).toBe(validReceipt.serverSecret);
    expect(out.validation?.receipt?.epochId).toBe(20260420);
  });

  it('decodes a URL-safe (base64url) receipt with stripped padding', async () => {
    const out = await loadReceiptFromSearch(`?receipt=${b64url(validReceipt)}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(true);
    expect(out.validation?.receipt?.userId).toBe(validReceipt.userId);
  });

  it('flags malformed base64 with a clear error', async () => {
    const out = await loadReceiptFromSearch(
      '?receipt=%21%21%21not-base64%21%21%21',
    );
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
    expect(out.validation?.error?.toLowerCase()).toContain('base64');
  });

  it('flags valid base64 of invalid JSON', async () => {
    const out = await loadReceiptFromSearch(`?receipt=${btoa('not json')}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
  });

  it('flags valid JSON that fails receipt validation', async () => {
    const out = await loadReceiptFromSearch(
      `?receipt=${b64({ ...validReceipt, version: 99 })}`,
    );
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
    expect(out.validation?.error?.toLowerCase()).toContain('version');
  });

  it('flags an empty ?receipt= value', async () => {
    const out = await loadReceiptFromSearch('?receipt=');
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(false);
    expect(out.validation?.error?.toLowerCase()).toContain('empty');
  });

  // ── RIP-773: gzip-compressed payload path ───────────────────────

  it('decodes a gzip-compressed receipt (the current encoder path)', async () => {
    const payload = await gzipB64(validReceipt);
    const out = await loadReceiptFromSearch(`?receipt=${encodeURIComponent(payload)}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(true);
    expect(out.validation?.receipt?.serverSecret).toBe(validReceipt.serverSecret);
  });

  it('decodes a real-catalog-sized gzipped receipt under the gh-pages URL ceiling', async () => {
    // 200-item draw table mirrors a mid-size production pack-config —
    // ~30-char SKUs + integer weights compress beautifully thanks to
    // the shared `v1:_fb:` prefix and tight integer dictionary.
    const items = Array.from({ length: 200 }, (_, i) => ({
      sku: `v1:_fb:${i.toString(16).padStart(12, '0')}:graded:10:JP`,
      weight: 12345 + i,
    }));
    const big = {
      ...validReceipt,
      drawTables: [{ drawId: 0, drawsPerOpen: 1, items }],
    };

    const payload = await gzipB64(big);

    // Must fit comfortably under gh-pages' practical URL ceiling
    // (~32 KB). Encoded fixture is the dominant chunk; the rest of
    // the URL is a couple hundred bytes.
    expect(payload.length).toBeLessThan(32_000);

    const out = await loadReceiptFromSearch(`?receipt=${encodeURIComponent(payload)}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(true);
    expect(out.validation?.receipt?.drawTables[0].items).toHaveLength(200);
  });

  it('falls back to plain UTF-8 when the bytes are valid base64 but not gzip', async () => {
    // Legacy uncompressed deep-links (any short pre-RIP-773 link still
    // in flight) must still work after the encoder switches to gzip.
    const out = await loadReceiptFromSearch(`?receipt=${b64(validReceipt)}`);
    expect(out.present).toBe(true);
    expect(out.validation?.valid).toBe(true);
  });
});

describe('decodeBase64Json', () => {
  it('round-trips a standard base64 JSON string', async () => {
    await expect(decodeBase64Json(btoa('{"a":1}'))).resolves.toBe('{"a":1}');
  });

  it('round-trips URL-safe base64 with - and _', async () => {
    // 0xFF 0xFE 0xFD → "//79" in standard, "__79" in URL-safe (here we
    // construct a payload whose padding-stripped form has both - and _).
    const payload = '{"x":"hello world"}';
    const std = btoa(payload);
    const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    await expect(decodeBase64Json(urlSafe)).resolves.toBe(payload);
  });

  it('rejects empty input', async () => {
    await expect(decodeBase64Json('')).rejects.toThrow(/empty/i);
  });

  it('round-trips a gzip-compressed JSON string', async () => {
    const original = JSON.stringify({ x: 'hello'.repeat(50) });
    const payload = await gzipB64({ x: 'hello'.repeat(50) });
    await expect(decodeBase64Json(payload)).resolves.toBe(original);
  });
});
