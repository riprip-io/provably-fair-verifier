/**
 * URL-parameter receipt loading (RIP-753).
 *
 * Lets external tools (e.g. the RipRip admintool) deep-link into the
 * verifier with a fully-prefilled VerificationReceipt:
 *
 *   /provably-fair-verifier/?receipt=<base64-json>
 *
 * The receipt blob is the same JSON shape the manual "Import Receipt"
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
export function loadReceiptFromSearch(search: string): UrlReceiptLoad {
  const params = new URLSearchParams(search);
  const raw = params.get(RECEIPT_PARAM);
  if (raw === null) {
    return { present: false };
  }

  let json: string;
  try {
    json = decodeBase64Json(raw);
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
 */
export function decodeBase64Json(input: string): string {
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

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('?receipt did not decode to valid UTF-8 JSON');
  }
}
