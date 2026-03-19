import { isValidUUID, isValidHex64, validateDrawTablesJSON } from './validation';

export interface VerificationReceipt {
  version: number;
  serverSecret: string;
  commitHash?: string;
  epochId: number;
  userId: string;
  clientSeed: string;
  purchaseNonce: number;
  packConfigHash: string;
  quantity: number;
  drawTables: Array<{
    drawId: number;
    drawsPerOpen: number;
    items: Array<{ sku: string; weight: number }>;
  }>;
}

export interface ReceiptValidation {
  valid: boolean;
  receipt?: VerificationReceipt;
  error?: string;
}

export function parseReceipt(json: string): ReceiptValidation {
  try {
    const parsed = JSON.parse(json);

    if (typeof parsed !== 'object' || parsed === null) {
      return { valid: false, error: 'Must be a JSON object' };
    }

    if (parsed.version !== 1) {
      return { valid: false, error: `Unsupported version: ${parsed.version}` };
    }

    if (!isValidHex64(parsed.serverSecret)) {
      return { valid: false, error: 'Invalid serverSecret (expected 64 hex chars)' };
    }

    if (parsed.commitHash !== undefined && !isValidHex64(parsed.commitHash)) {
      return { valid: false, error: 'Invalid commitHash (expected 64 hex chars)' };
    }

    if (typeof parsed.epochId !== 'number' || parsed.epochId < 1) {
      return { valid: false, error: 'Invalid epochId' };
    }

    if (!isValidUUID(parsed.userId)) {
      return { valid: false, error: 'Invalid userId (expected UUID)' };
    }

    if (typeof parsed.clientSeed !== 'string' || !parsed.clientSeed) {
      return { valid: false, error: 'Missing clientSeed' };
    }

    if (typeof parsed.purchaseNonce !== 'number' || parsed.purchaseNonce < 0 || !Number.isInteger(parsed.purchaseNonce)) {
      return { valid: false, error: 'Invalid purchaseNonce (expected non-negative integer)' };
    }

    if (!isValidHex64(parsed.packConfigHash)) {
      return { valid: false, error: 'Invalid packConfigHash (expected 64 hex chars)' };
    }

    if (typeof parsed.quantity !== 'number' || parsed.quantity < 1 || !Number.isInteger(parsed.quantity)) {
      return { valid: false, error: 'Invalid quantity (expected positive integer)' };
    }

    const drawValidation = validateDrawTablesJSON(JSON.stringify(parsed.drawTables));
    if (!drawValidation.valid) {
      return { valid: false, error: `drawTables: ${drawValidation.error}` };
    }

    return { valid: true, receipt: parsed as VerificationReceipt };
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }
}
