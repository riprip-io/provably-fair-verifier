import { isValidUUID, isValidHex64, isValidHex96, validateDrawTablesJSON, MAX_QUANTITY } from './validation';
import { QUICKNET_GENESIS_TIME } from './openv2';

export interface VerificationReceipt {
  /** 1 = OPENv1; 2 = OPENv2 (adds the drand entropy fields, RIP-996). */
  version: number;
  serverSecret: string;
  commitHash?: string;
  epochId: number;
  userId: string;
  clientSeed: string;
  purchaseNonce: number;
  packConfigHash: string;
  quantity: number;
  /**
   * Which open of the batch this receipt describes (0-based). Optional: older
   * receipts predate the field and are treated as open 0 (RIP-1313).
   */
  openIndex?: number;
  drawTables: Array<{
    drawId: number;
    drawsPerOpen: number;
    items: Array<{ sku: string; weight: number }>;
  }>;
  /**
   * OPENv2 only (version === 2): drand quicknet entropy. drandRound must be
   * the first round published strictly after entropyTs; drandRandomness is
   * SHA256(drandSignature); the signature BLS-verifies against the quicknet
   * group public key (see lib/openv2.ts).
   */
  entropyTs?: number;
  drandRound?: number;
  drandRandomness?: string;
  drandSignature?: string;
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

    if (parsed.version !== 1 && parsed.version !== 2) {
      return { valid: false, error: `Unsupported version: ${parsed.version}` };
    }

    // Trim string fields before validation
    if (typeof parsed.serverSecret === 'string') parsed.serverSecret = parsed.serverSecret.trim();
    if (typeof parsed.commitHash === 'string') parsed.commitHash = parsed.commitHash.trim();
    if (typeof parsed.userId === 'string') parsed.userId = parsed.userId.trim();
    if (typeof parsed.clientSeed === 'string') parsed.clientSeed = parsed.clientSeed.trim();
    if (typeof parsed.packConfigHash === 'string') parsed.packConfigHash = parsed.packConfigHash.trim();

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
    if (parsed.quantity > MAX_QUANTITY) {
      return { valid: false, error: `quantity must be ≤ ${MAX_QUANTITY}` };
    }

    // Optional; absent on pre-RIP-1313 receipts, which are treated as open 0.
    // When present it must address an open the batch actually contains —
    // otherwise the draw the user is looking at is not derivable from this
    // receipt at all.
    if (parsed.openIndex !== undefined) {
      if (
        typeof parsed.openIndex !== 'number' ||
        !Number.isInteger(parsed.openIndex) ||
        parsed.openIndex < 0
      ) {
        return { valid: false, error: 'Invalid openIndex (expected non-negative integer)' };
      }
      if (parsed.openIndex >= parsed.quantity) {
        return {
          valid: false,
          error: `openIndex ${parsed.openIndex} is outside a batch of ${parsed.quantity}`,
        };
      }
    }

    const drawValidation = validateDrawTablesJSON(JSON.stringify(parsed.drawTables));
    if (!drawValidation.valid) {
      return { valid: false, error: `drawTables: ${drawValidation.error}` };
    }

    // OPENv2 (RIP-996): the four entropy fields are mandatory — a v2 receipt
    // without them can never verify.
    if (parsed.version === 2) {
      if (typeof parsed.drandRandomness === 'string') parsed.drandRandomness = parsed.drandRandomness.trim();
      if (typeof parsed.drandSignature === 'string') parsed.drandSignature = parsed.drandSignature.trim();

      if (
        typeof parsed.entropyTs !== 'number' ||
        !Number.isInteger(parsed.entropyTs) ||
        parsed.entropyTs < QUICKNET_GENESIS_TIME
      ) {
        return {
          valid: false,
          error: `Invalid entropyTs (expected integer unix seconds ≥ quicknet genesis ${QUICKNET_GENESIS_TIME})`,
        };
      }
      if (
        typeof parsed.drandRound !== 'number' ||
        !Number.isInteger(parsed.drandRound) ||
        parsed.drandRound < 1
      ) {
        return { valid: false, error: 'Invalid drandRound (expected positive integer)' };
      }
      if (typeof parsed.drandRandomness !== 'string' || !isValidHex64(parsed.drandRandomness)) {
        return { valid: false, error: 'Invalid drandRandomness (expected 64 hex chars)' };
      }
      if (typeof parsed.drandSignature !== 'string' || !isValidHex96(parsed.drandSignature)) {
        return { valid: false, error: 'Invalid drandSignature (expected 96 hex chars — BLS G1)' };
      }
    }

    return { valid: true, receipt: parsed as VerificationReceipt };
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }
}
