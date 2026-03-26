import type { DrawTable } from '@riprip-io/provably-fair';

export const MAX_QUANTITY = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function isValidHex64(value: string): boolean {
  const stripped = value.trim().startsWith('0x') ? value.trim().slice(2) : value.trim();
  return /^[0-9a-fA-F]{64}$/.test(stripped);
}

export function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value.trim()) && parseInt(value.trim(), 10) > 0;
}

export function isNonNegativeInteger(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

export interface DrawTableValidation {
  valid: boolean;
  tables?: DrawTable[];
  error?: string;
}

export function validateDrawTablesJSON(json: string): DrawTableValidation {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return { valid: false, error: 'Must be a JSON array' };
    }
    for (let i = 0; i < parsed.length; i++) {
      const t = parsed[i];
      if (typeof t.drawId !== 'number') {
        return { valid: false, error: `Table ${i}: missing or invalid drawId` };
      }
      if (typeof t.drawsPerOpen !== 'number' || t.drawsPerOpen < 1) {
        return { valid: false, error: `Table ${i}: drawsPerOpen must be >= 1` };
      }
      if (!Array.isArray(t.items) || t.items.length === 0) {
        return { valid: false, error: `Table ${i}: items must be a non-empty array` };
      }
      for (let j = 0; j < t.items.length; j++) {
        const item = t.items[j];
        if (typeof item.sku !== 'string' || !item.sku) {
          return { valid: false, error: `Table ${i}, item ${j}: invalid sku` };
        }
        if (typeof item.weight !== 'number' || item.weight < 1 || !Number.isInteger(item.weight)) {
          return { valid: false, error: `Table ${i}, item ${j}: weight must be a positive integer` };
        }
      }
    }
    return { valid: true, tables: parsed as DrawTable[] };
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }
}
