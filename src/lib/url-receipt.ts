/**
 * URL-parameter receipt loading (RIP-753, gzip-extended in RIP-773).
 *
 * Lets external tools (e.g. the RipRip admintool) deep-link into the
 * verifier with a fully-prefilled VerificationReceipt:
 *
 *   /provably-fair-verifier/?receipt=<base64>
 *
 * The base64 payload decodes to either:
 *   - gzip-compressed JSON (current encoder, fits real pack-config
 *     receipts inside gh-pages' ~32 KB URL ceiling), or
 *   - plain UTF-8 JSON (legacy encoder; back-compat).
 *
 * The decoded JSON shape is the same one the manual "Import Receipt"
 * paste path accepts (lib/receipt.ts), so the deep-link reuses the
 * existing validator. Both standard and URL-safe base64 are accepted —
 * padding is optional. Decoded JSON is run through parseReceipt() so
 * malformed or hostile payloads can never bypass the form's validation.
 */

import { parseReceipt, type ReceiptValidation } from './receipt';

const RECEIPT_PARAM = 'receipt';

export interface UrlReceiptLoad {
  /** True when the URL contained a `?receipt=` param (regardless of validity). */
  present: boolean;
  /** Parsed receipt validation result — only meaningful when `present` is true. */
  validation?: ReceiptValidation;
}

/** Reads the `?receipt=` param from a URL search string and validates it. */
export async function loadReceiptFromSearch(search: string): Promise<UrlReceiptLoad> {
  const params = new URLSearchParams(search);
  const raw = params.get(RECEIPT_PARAM);
  if (raw === null) {
    return { present: false };
  }

  let json: string;
  try {
    json = await decodeBase64Json(raw);
  } catch (err) {
    return {
      present: true,
      validation: {
        valid: false,
        error: err instanceof Error ? err.message : 'Could not decode ?receipt parameter',
      },
    };
  }

  return { present: true, validation: parseReceipt(json) };
}

/**
 * Decode a base64-or-base64url string into a UTF-8 JSON string.
 *
 * Accepts:
 * - Standard base64 (`+/`, optional `=` padding)
 * - URL-safe base64 (`-_`, padding optional)
 *
 * After base64 decode, tries gzip-decompress first. If decompression
 * fails (legacy uncompressed deep-link), falls back to interpreting
 * the bytes as plain UTF-8 directly. The fallback path is what kept
 * any short pre-RIP-773 deep-links working after this change.
 */
export async function decodeBase64Json(input: string): Promise<string> {
  const trimmed = input.trim();
  if (trimmed === '') throw new Error('Empty ?receipt parameter');

  // Normalize URL-safe alphabet → standard, then pad to a multiple of 4.
  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  let bytes: Uint8Array;
  try {
    const binary = atob(padded);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    throw new Error('?receipt is not valid base64');
  }

  // Gzip path: succeeds for current-encoder receipts. The
  // DecompressionStream throws on non-gzip input (no magic bytes), so
  // catching here is the natural way to distinguish gzipped from
  // legacy plain payloads — we don't want to inspect 0x1f8b ourselves
  // because a legacy plain-JSON payload could in theory start with
  // those bytes (it can't actually — JSON starts with `{`/`[`/`"` —
  // but defending against the hypothetical is free).
  try {
    const decompressed = await gunzip(bytes);
    return new TextDecoder('utf-8', { fatal: true }).decode(decompressed);
  } catch {
    // Fall through to legacy plain-JSON path.
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('?receipt did not decode to valid UTF-8 JSON');
  }
}

/**
 * gzip-decompress a `Uint8Array` via the native `DecompressionStream`.
 *
 * Source stream is `Response(bytes).body` rather than `Blob.stream()`
 * — both work at runtime, but the former's typings line up with
 * `DecompressionStream` under TS strict mode (the latter resolves to
 * `ReadableStream<Uint8Array<ArrayBuffer>>` which the DOM lib can't
 * widen to the writable side's `BufferSource`).
 */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  // Drive the DecompressionStream's writable side directly instead of
  // piping through Blob.stream() / Response.body — the latter trips
  // the DOM lib's strict ArrayBuffer-vs-ArrayBufferLike typing on
  // Uint8Array under TS 5.7+. Writer.write() accepts BufferSource so
  // the typing here is clean. If the bytes aren't valid gzip the
  // writer or reader rejects and the caller falls through to the
  // plain-UTF-8 path.
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  // Floating intentionally — errors surface on the reader side; we
  // swallow them here only to avoid an unhandled-rejection warning.
  // `bytes as BufferSource`: TS 5.7+ models `Uint8Array<ArrayBufferLike>`
  // (which we have from atob → new Uint8Array(binary.length)) as
  // distinct from BufferSource's `Uint8Array<ArrayBuffer>` because
  // ArrayBufferLike admits SharedArrayBuffer. We never construct
  // SharedArrayBuffer here, so the runtime cast is safe.
  void writer
    .write(bytes as BufferSource)
    .then(() => writer.close())
    .catch(() => {});
  const reader = ds.readable.getReader();
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
  for (const chunk of chunks) {
    out.set(chunk, off);
    off += chunk.length;
  }
  return out;
}
