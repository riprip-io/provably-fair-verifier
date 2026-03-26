import { useState } from 'preact/hooks';
import {
  deriveUserKey,
  deriveClientSeedHash,
  verifyEpoch,
  commitEpoch,
  resolveOpenBatch,
  type OpenBatchResult,
} from '@riprip-io/provably-fair';
import { parseHex, bytesToHex } from '../lib/hex';
import { isValidUUID, isValidHex64, isNonNegativeInteger, isPositiveInteger, validateDrawTablesJSON, MAX_QUANTITY } from '../lib/validation';
import type { VerificationReceipt } from '../lib/receipt';
import { ReceiptImport } from './receipt-import';
import { DrawTablesInput } from './draw-tables-input';
import { ResultsDisplay } from './results-display';

export function FullVerifier() {
  const [serverSecret, setServerSecret] = useState('');
  const [commitHash, setCommitHash] = useState('');
  const [userId, setUserId] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [purchaseNonce, setPurchaseNonce] = useState('');
  const [epochId, setEpochId] = useState('');
  const [packConfigHash, setPackConfigHash] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [drawTablesJson, setDrawTablesJson] = useState('');

  const [results, setResults] = useState<OpenBatchResult | null>(null);
  const [epochCheck, setEpochCheck] = useState<{ valid: boolean; computedHash: string } | null>(null);
  const [intermediates, setIntermediates] = useState<{ userKey: string; clientSeedHash: string } | null>(null);
  const [error, setError] = useState('');

  function handleImport(receipt: VerificationReceipt) {
    setServerSecret(receipt.serverSecret);
    setCommitHash(receipt.commitHash ?? '');
    setUserId(receipt.userId);
    setClientSeed(receipt.clientSeed);
    setPurchaseNonce(String(receipt.purchaseNonce));
    setEpochId(String(receipt.epochId));
    setPackConfigHash(receipt.packConfigHash);
    setQuantity(String(receipt.quantity));
    setDrawTablesJson(JSON.stringify(receipt.drawTables, null, 2));
  }

  function handleVerify() {
    setResults(null);
    setEpochCheck(null);
    setIntermediates(null);
    setError('');

    // Validate inputs
    if (!isValidHex64(serverSecret)) {
      setError('Server Secret must be 64 hex characters');
      return;
    }
    if (commitHash && !isValidHex64(commitHash)) {
      setError('Commit Hash must be 64 hex characters (or leave empty to skip epoch check)');
      return;
    }
    if (!isValidUUID(userId)) {
      setError('User ID must be a valid UUID');
      return;
    }
    if (!clientSeed.trim()) {
      setError('Client Seed is required');
      return;
    }
    if (!isValidHex64(clientSeed)) {
      setError('Client Seed must be 64 hex characters');
      return;
    }
    if (!isNonNegativeInteger(purchaseNonce)) {
      setError('Purchase Nonce must be a non-negative integer');
      return;
    }
    if (!isPositiveInteger(epochId)) {
      setError('Epoch ID must be a positive integer (YYYYMMDD)');
      return;
    }
    if (!isValidHex64(packConfigHash)) {
      setError('Pack Config Hash must be 64 hex characters');
      return;
    }
    if (!isPositiveInteger(quantity)) {
      setError('Quantity must be a positive integer');
      return;
    }
    if (parseInt(quantity, 10) > MAX_QUANTITY) {
      setError(`Quantity must be ≤ ${MAX_QUANTITY}`);
      return;
    }

    const drawValidation = validateDrawTablesJSON(drawTablesJson);
    if (!drawValidation.valid) {
      setError(`Draw Tables: ${drawValidation.error}`);
      return;
    }

    try {
      const secretBytes = parseHex(serverSecret);

      // Epoch check (optional)
      if (commitHash) {
        const hashBytes = parseHex(commitHash);
        const computed = commitEpoch(secretBytes);
        const valid = verifyEpoch(secretBytes, hashBytes);
        setEpochCheck({ valid, computedHash: bytesToHex(computed) });
        if (!valid) return;
      }

      // Derive intermediate values
      const userKey = deriveUserKey(userId.trim());
      const clientSeedHash = deriveClientSeedHash(clientSeed.trim());
      setIntermediates({
        userKey: bytesToHex(userKey),
        clientSeedHash: bytesToHex(clientSeedHash),
      });

      // Resolve all opens
      const batchResult = resolveOpenBatch(
        secretBytes,
        parseInt(epochId, 10),
        userKey,
        BigInt(purchaseNonce),
        parseHex(packConfigHash),
        clientSeedHash,
        parseInt(quantity, 10),
        drawValidation.tables!,
      );

      setResults(batchResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
  }

  return (
    <div>
      <p class="text-sm text-gray-400 mb-4">
        Re-derive every draw from a pack opening to verify results were computed honestly.
      </p>

      <ReceiptImport onImport={handleImport} />

      <div class="space-y-6">
        {/* Epoch Section */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">Epoch</legend>
          <Field label="Server Secret" value={serverSecret} onInput={setServerSecret} placeholder="64 hex characters" />
          <Field label="Commit Hash (optional)" value={commitHash} onInput={setCommitHash} placeholder="64 hex characters — skip to omit epoch check" />
        </fieldset>

        {/* User Section */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">User</legend>
          <Field label="User ID" value={userId} onInput={setUserId} placeholder="UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)" />
          <Field label="Client Seed" value={clientSeed} onInput={setClientSeed} placeholder="64 hex characters (your random seed)" />
          <Field label="Purchase Nonce" value={purchaseNonce} onInput={setPurchaseNonce} placeholder="Non-negative integer" />
        </fieldset>

        {/* Pack Section */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">Pack</legend>
          <Field label="Epoch ID" value={epochId} onInput={setEpochId} placeholder="YYYYMMDD (e.g. 20260210)" />
          <Field label="Pack Config Hash" value={packConfigHash} onInput={setPackConfigHash} placeholder="64 hex characters" />
          <Field label="Quantity" value={quantity} onInput={setQuantity} placeholder="Number of packs in batch" />
        </fieldset>

        {/* Draw Tables */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">Draw Tables</legend>
          <DrawTablesInput value={drawTablesJson} onInput={setDrawTablesJson} />
        </fieldset>

        <button
          onClick={handleVerify}
          class="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition-colors"
        >
          Verify Pack Opening
        </button>
      </div>

      {error && (
        <div class="mt-4 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {results && (
        <ResultsDisplay
          results={results}
          epochCheck={epochCheck}
          intermediates={intermediates}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onInput,
  placeholder,
}: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label class="block">
      <span class="text-sm font-medium text-gray-300">{label}</span>
      <input
        type="text"
        value={value}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        class="mt-1 block w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
        spellcheck={false}
      />
    </label>
  );
}
