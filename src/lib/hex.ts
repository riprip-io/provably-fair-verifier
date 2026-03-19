import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export { bytesToHex, hexToBytes };

/** Strip optional 0x prefix and validate hex string */
export function normalizeHex(input: string): string {
  const stripped = input.startsWith('0x') ? input.slice(2) : input;
  if (!/^[0-9a-fA-F]*$/.test(stripped)) {
    throw new Error('Invalid hex characters');
  }
  return stripped.toLowerCase();
}

/** Parse hex string (with optional 0x) to Uint8Array */
export function parseHex(input: string): Uint8Array {
  return hexToBytes(normalizeHex(input));
}
