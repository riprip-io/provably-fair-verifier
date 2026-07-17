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
import { resolveOpenBatchV2, checkEntropy, type EntropyCheckResult } from '../lib/openv2';
import type { VerificationReceipt } from '../lib/receipt';
import { ReceiptImport } from './receipt-import';
import { DrawTablesInput } from './draw-tables-input';
import { ResultsDisplay } from './results-display';

interface FullVerifierProps {
  /**
   * Pre-imported receipt (RIP-753). When set, the form mounts with all
   * fields prefilled — used for `?receipt=<b64>` deep-links from the
   * RipRip admintool's per-opening verifier button.
   */
  initialReceipt?: VerificationReceipt;
  /** Error to render when the URL-borne receipt failed to decode. */
  initialReceiptError?: string;
}

function preloadFromReceipt(r: VerificationReceipt | undefined) {
  return {
    serverSecret: r?.serverSecret ?? '',
    commitHash: r?.commitHash ?? '',
    userId: r?.userId ?? '',
    clientSeed: r?.clientSeed ?? '',
    purchaseNonce: r ? String(r.purchaseNonce) : '',
    epochId: r ? String(r.epochId) : '',
    packConfigHash: r?.packConfigHash ?? '',
    quantity: r ? String(r.quantity) : '1',
    drawTablesJson: r ? JSON.stringify(r.drawTables, null, 2) : '',
    isV2: r?.version === 2,
    entropyTs: r?.entropyTs != null ? String(r.entropyTs) : '',
    drandRound: r?.drandRound != null ? String(r.drandRound) : '',
    drandRandomness: r?.drandRandomness ?? '',
    drandSignature: r?.drandSignature ?? '',
  };
}

export function FullVerifier({ initialReceipt, initialReceiptError }: FullVerifierProps = {}) {
  const seed = preloadFromReceipt(initialReceipt);
  const [serverSecret, setServerSecret] = useState(seed.serverSecret);
  const [commitHash, setCommitHash] = useState(seed.commitHash);
  const [userId, setUserId] = useState(seed.userId);
  const [clientSeed, setClientSeed] = useState(seed.clientSeed);
  const [purchaseNonce, setPurchaseNonce] = useState(seed.purchaseNonce);
  const [epochId, setEpochId] = useState(seed.epochId);
  const [packConfigHash, setPackConfigHash] = useState(seed.packConfigHash);
  const [quantity, setQuantity] = useState(seed.quantity);
  const [drawTablesJson, setDrawTablesJson] = useState(seed.drawTablesJson);
  const [isV2, setIsV2] = useState(seed.isV2);
  const [entropyTs, setEntropyTs] = useState(seed.entropyTs);
  const [drandRound, setDrandRound] = useState(seed.drandRound);
  const [drandRandomness, setDrandRandomness] = useState(seed.drandRandomness);
  const [drandSignature, setDrandSignature] = useState(seed.drandSignature);

  const [results, setResults] = useState<OpenBatchResult | null>(null);
  const [entropyCheck, setEntropyCheck] = useState<EntropyCheckResult | null>(null);
  const [epochCheck, setEpochCheck] = useState<{ valid: boolean; computedHash: string } | null>(null);
  const [intermediates, setIntermediates] = useState<{ userKey: string; clientSeedHash: string } | null>(null);
  const [error, setError] = useState(initialReceiptError ?? '');

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
    setIsV2(receipt.version === 2);
    setEntropyTs(receipt.entropyTs != null ? String(receipt.entropyTs) : '');
    setDrandRound(receipt.drandRound != null ? String(receipt.drandRound) : '');
    setDrandRandomness(receipt.drandRandomness ?? '');
    setDrandSignature(receipt.drandSignature ?? '');
  }

  function handleVerify() {
    setResults(null);
    setEntropyCheck(null);
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

    // OPENv2 entropy inputs (RIP-996)
    if (isV2) {
      if (!isNonNegativeInteger(entropyTs)) {
        setError('Entropy Timestamp must be a non-negative integer (unix seconds)');
        return;
      }
      if (!isPositiveInteger(drandRound)) {
        setError('drand Round must be a positive integer');
        return;
      }
      if (!isValidHex64(drandRandomness)) {
        setError('drand Randomness must be 64 hex characters');
        return;
      }
      if (!/^[0-9a-fA-F]{96}$/.test(drandSignature.trim())) {
        setError('drand Signature must be 96 hex characters (BLS G1)');
        return;
      }
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

      // OPENv2: authenticate the beacon BEFORE replaying draws. All three
      // checks run fully offline (round rule, sha256(sig)==randomness, BLS
      // against the quicknet group key) — no relay or RipRip trust needed.
      if (isV2) {
        const check = checkEntropy({
          entropyTs: parseInt(entropyTs, 10),
          drandRound: parseInt(drandRound, 10),
          drandRandomness: parseHex(drandRandomness),
          drandSignature: parseHex(drandSignature),
        });
        setEntropyCheck(check);
        if (!check.valid) return;
      }

      // Resolve all opens — protocol dispatch on the receipt version.
      const batchResult = isV2
        ? resolveOpenBatchV2(
            secretBytes,
            parseInt(epochId, 10),
            userKey,
            BigInt(purchaseNonce),
            parseHex(packConfigHash),
            clientSeedHash,
            { drandRound: parseInt(drandRound, 10), drandRandomness: parseHex(drandRandomness) },
            parseInt(quantity, 10),
            drawValidation.tables!,
          )
        : resolveOpenBatch(
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

        {/* Protocol (RIP-996: OPENv2 adds drand beacon entropy) */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">RNG Protocol</legend>
          <label class="block">
            <span class="text-sm font-medium text-gray-300">Version</span>
            <select
              value={isV2 ? 'OPENv2' : 'OPENv1'}
              onChange={(e) => setIsV2((e.target as HTMLSelectElement).value === 'OPENv2')}
              class="mt-1 block w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="OPENv1">OPENv1</option>
              <option value="OPENv2">OPENv2 (drand beacon entropy)</option>
            </select>
          </label>
          {isV2 && (
            <>
              <Field label="Entropy Timestamp" value={entropyTs} onInput={setEntropyTs} placeholder="Unix seconds that anchored the drand round" />
              <Field label="drand Round" value={drandRound} onInput={setDrandRound} placeholder="Positive integer (quicknet round number)" />
              <Field label="drand Randomness" value={drandRandomness} onInput={setDrandRandomness} placeholder="64 hex characters" />
              <Field label="drand Signature" value={drandSignature} onInput={setDrandSignature} placeholder="96 hex characters (BLS G1 signature)" />
            </>
          )}
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

      {entropyCheck && <EntropyChecks check={entropyCheck} />}

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

/**
 * OPENv2 beacon authentication results (RIP-996). All three checks run
 * fully offline in the browser — a green panel means the beacon is
 * authentic League-of-Entropy output, per protocol, with no trust in
 * RipRip OR the drand relays.
 */
function EntropyChecks({ check }: { check: EntropyCheckResult }) {
  const row = (ok: boolean, label: string, detail: string) => (
    <div class="flex items-start gap-2 text-sm">
      <span class={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      <span class="text-gray-300">
        <strong>{label}</strong> — {detail}
      </span>
    </div>
  );
  return (
    <div
      class={`mt-4 p-3 rounded border text-sm space-y-2 ${
        check.valid ? 'bg-emerald-900/20 border-emerald-800' : 'bg-red-900/40 border-red-700'
      }`}
    >
      <div class={`font-semibold ${check.valid ? 'text-emerald-400' : 'text-red-300'}`}>
        drand beacon {check.valid ? 'authenticated' : 'FAILED authentication'}
      </div>
      {row(
        check.roundRuleValid,
        'Round rule',
        check.roundRuleValid
          ? 'round is the first published strictly after the timestamp'
          : `expected round ${check.expectedRound} for this timestamp`,
      )}
      {row(check.sha256Valid, 'Randomness', 'randomness = SHA256(signature)')}
      {row(check.blsValid, 'BLS signature', 'verifies against the drand quicknet group public key')}
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
