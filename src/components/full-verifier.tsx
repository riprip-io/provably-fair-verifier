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
import { isValidUUID, isValidHex64, isValidHex96, isNonNegativeInteger, isPositiveInteger, validateDrawTablesJSON, MAX_QUANTITY } from '../lib/validation';
import { resolveOpenBatchV2, checkEntropy, type EntropyCheckResult } from '../lib/openv2';
import type { VerificationReceipt } from '../lib/receipt';
import { ReceiptImport } from './receipt-import';
import { DrawTablesInput } from './draw-tables-input';
import { ResultsDisplay } from './results-display';
import { EpochVerdictBanner, type EpochVerdict } from './epoch-verdict';

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
    // Receipt-only: which open of the batch the receipt is about. There is no
    // form field for it — a hand-filled verification has no single subject.
    openIndex: r?.openIndex,
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
  const [subjectOpenIndex, setSubjectOpenIndex] = useState(seed.openIndex);

  const [results, setResults] = useState<OpenBatchResult | null>(null);
  const [entropyCheck, setEntropyCheck] = useState<EntropyCheckResult | null>(null);
  const [epochCheck, setEpochCheck] = useState<EpochVerdict | null>(null);
  const [intermediates, setIntermediates] = useState<{ userKey: string; clientSeedHash: string } | null>(null);
  const [error, setError] = useState(initialReceiptError ?? '');

  function handleImport(receipt: VerificationReceipt) {
    // Single source of the receipt→form mapping: preloadFromReceipt.
    const f = preloadFromReceipt(receipt);
    setServerSecret(f.serverSecret);
    setCommitHash(f.commitHash);
    setUserId(f.userId);
    setClientSeed(f.clientSeed);
    setPurchaseNonce(f.purchaseNonce);
    setEpochId(f.epochId);
    setPackConfigHash(f.packConfigHash);
    setQuantity(f.quantity);
    setDrawTablesJson(f.drawTablesJson);
    setIsV2(f.isV2);
    setEntropyTs(f.entropyTs);
    setDrandRound(f.drandRound);
    setDrandRandomness(f.drandRandomness);
    setDrandSignature(f.drandSignature);
    setSubjectOpenIndex(f.openIndex);
    // Fresh inputs invalidate any previous verification output.
    clearOutputs();
  }

  // Any edit voids the previous run's output. The version <select> and the
  // receipt import already did this; the text fields did not, which left a
  // verdict standing beside inputs that did not produce it. For a trust tool
  // that is the same class of lie as showing no verdict at all (RIP-1237).
  const hasOutput =
    results !== null ||
    epochCheck !== null ||
    entropyCheck !== null ||
    intermediates !== null ||
    error !== '';

  function edited(setter: (v: string) => void): (v: string) => void {
    return (v: string) => {
      setter(v);
      if (hasOutput) clearOutputs();
    };
  }

  function clearOutputs() {
    setResults(null);
    setEntropyCheck(null);
    setEpochCheck(null);
    setIntermediates(null);
    setError('');
  }

  function handleVerify() {
    clearOutputs();

    // Validate inputs
    if (!isValidHex64(serverSecret)) {
      setError('Server Secret must be 64 hex characters');
      return;
    }
    const trimmedCommitHash = commitHash.trim();
    if (trimmedCommitHash && !isValidHex64(trimmedCommitHash)) {
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

    // Protocol downgrade guard (RIP-996): entropy inputs present while
    // OPENv1 is selected would silently skip beacon authentication and
    // replay the draws under the wrong message format — refuse.
    const hasEntropyInput =
      Boolean(entropyTs.trim() || drandRound.trim() || drandRandomness.trim() || drandSignature.trim());
    if (!isV2 && hasEntropyInput) {
      setError(
        'These inputs include OPENv2 drand entropy. Select OPENv2 to verify them (or clear the four entropy fields to verify as OPENv1).',
      );
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
      if (!isValidHex96(drandSignature)) {
        setError('drand Signature must be 96 hex characters (BLS G1)');
        return;
      }
    }

    try {
      const secretBytes = parseHex(serverSecret.trim());

      // Epoch check. The commitment is optional, but its ABSENCE is itself a
      // verdict the user has to see: without it nothing proves the server
      // secret was fixed before the purchase, and a silent skip renders as an
      // ordinary green results table (RIP-1237).
      const computedHash = bytesToHex(commitEpoch(secretBytes));
      if (trimmedCommitHash) {
        const hashBytes = parseHex(trimmedCommitHash);
        const valid = verifyEpoch(secretBytes, hashBytes);
        setEpochCheck({
          status: valid ? 'valid' : 'invalid',
          computedHash,
          // Snapshot the bytes verifyEpoch actually compared, so the banner
          // can never show a hash pair that was not the one checked.
          commitHash: bytesToHex(hashBytes),
        });
        // A failed reveal stops the run — draws are NEVER replayed against a
        // secret that does not open the published commitment. The verdict
        // stays visible because EpochVerdictBanner renders outside the
        // `results` guard.
        if (!valid) return;
      } else {
        setEpochCheck({ status: 'skipped', computedHash });
      }

      // Derive intermediate values
      const userKey = deriveUserKey(userId.trim());
      const clientSeedHash = deriveClientSeedHash(clientSeed.trim());
      setIntermediates({
        userKey: bytesToHex(userKey),
        clientSeedHash: bytesToHex(clientSeedHash),
      });

      // Parse every hex input up front (validators tolerate whitespace and
      // 0x prefixes; parseHex must see the trimmed value) so no throw can
      // happen after RESULTS are committed. The epoch verdict above is
      // committed earlier on purpose — it is valid on its own, and a throw
      // after it still renders the verdict plus an error banner.
      const packConfigHashBytes = parseHex(packConfigHash.trim());
      const drandRandomnessBytes = isV2 ? parseHex(drandRandomness.trim()) : null;
      const drandSignatureBytes = isV2 ? parseHex(drandSignature.trim()) : null;
      const drandRoundNum = isV2 ? parseInt(drandRound.trim(), 10) : 0;

      // OPENv2: authenticate the beacon BEFORE replaying draws. All three
      // checks run fully offline (round rule, sha256(sig)==randomness, BLS
      // against the quicknet group key).
      let check: EntropyCheckResult | null = null;
      if (isV2) {
        check = checkEntropy({
          entropyTs: parseInt(entropyTs.trim(), 10),
          drandRound: drandRoundNum,
          drandRandomness: drandRandomnessBytes!,
          drandSignature: drandSignatureBytes!,
        });
        if (!check.valid) {
          // Failed authentication renders the per-check panel and stops —
          // draws are never replayed against unauthenticated entropy.
          setEntropyCheck(check);
          return;
        }
      }

      // Resolve all opens — protocol dispatch on the receipt version.
      const batchResult = isV2
        ? resolveOpenBatchV2(
            secretBytes,
            parseInt(epochId, 10),
            userKey,
            BigInt(purchaseNonce),
            packConfigHashBytes,
            clientSeedHash,
            { drandRound: drandRoundNum, drandRandomness: drandRandomnessBytes! },
            parseInt(quantity, 10),
            drawValidation.tables!,
          )
        : resolveOpenBatch(
            secretBytes,
            parseInt(epochId, 10),
            userKey,
            BigInt(purchaseNonce),
            packConfigHashBytes,
            clientSeedHash,
            parseInt(quantity, 10),
            drawValidation.tables!,
          );

      // Commit the passing entropy panel and the results TOGETHER — a green
      // "authenticated" panel must never outlive a failed verification.
      if (check) setEntropyCheck(check);
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
          <Field label="Server Secret" value={serverSecret} onInput={edited(setServerSecret)} placeholder="64 hex characters" />
          <Field label="Commit Hash (optional)" value={commitHash} onInput={edited(setCommitHash)} placeholder="64 hex characters — skip to omit epoch check" />
        </fieldset>

        {/* User Section */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">User</legend>
          <Field label="User ID" value={userId} onInput={edited(setUserId)} placeholder="UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)" />
          <Field label="Client Seed" value={clientSeed} onInput={edited(setClientSeed)} placeholder="64 hex characters (your random seed)" />
          <Field label="Purchase Nonce" value={purchaseNonce} onInput={edited(setPurchaseNonce)} placeholder="Non-negative integer" />
        </fieldset>

        {/* Pack Section */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">Pack</legend>
          <Field label="Epoch ID" value={epochId} onInput={edited(setEpochId)} placeholder="YYYYMMDD (e.g. 20260210)" />
          <Field label="Pack Config Hash" value={packConfigHash} onInput={edited(setPackConfigHash)} placeholder="64 hex characters" />
          <Field label="Quantity" value={quantity} onInput={edited(setQuantity)} placeholder="Number of packs in batch" />
        </fieldset>

        {/* Protocol (RIP-996: OPENv2 adds drand beacon entropy) */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">RNG Protocol</legend>
          <label class="block">
            <span class="text-sm font-medium text-gray-300">Version</span>
            <select
              value={isV2 ? 'OPENv2' : 'OPENv1'}
              onChange={(e) => {
                setIsV2((e.target as HTMLSelectElement).value === 'OPENv2');
                clearOutputs();
              }}
              class="mt-1 block w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="OPENv1">OPENv1</option>
              <option value="OPENv2">OPENv2 (drand beacon entropy)</option>
            </select>
          </label>
          {isV2 && (
            <>
              <Field label="Entropy Timestamp" value={entropyTs} onInput={edited(setEntropyTs)} placeholder="Unix seconds that anchored the drand round" />
              <Field label="drand Round" value={drandRound} onInput={edited(setDrandRound)} placeholder="Positive integer (quicknet round number)" />
              <Field label="drand Randomness" value={drandRandomness} onInput={edited(setDrandRandomness)} placeholder="64 hex characters" />
              <Field label="drand Signature" value={drandSignature} onInput={edited(setDrandSignature)} placeholder="96 hex characters (BLS G1 signature)" />
            </>
          )}
        </fieldset>

        {/* Draw Tables */}
        <fieldset class="space-y-3">
          <legend class="text-xs font-semibold uppercase tracking-wider text-gray-500">Draw Tables</legend>
          <DrawTablesInput value={drawTablesJson} onInput={edited(setDrawTablesJson)} />
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

      {epochCheck && <EpochVerdictBanner verdict={epochCheck} />}

      {entropyCheck && <EntropyChecks check={entropyCheck} />}

      {results && (
        <ResultsDisplay
          results={results}
          intermediates={intermediates}
          subjectOpenIndex={subjectOpenIndex}
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
      {check.valid && (
        <div class="text-xs text-gray-400">
          Proves the beacon is genuine League-of-Entropy output for the stated entropy
          timestamp. Cross-check that timestamp against your purchase/settlement time —
          it should match when your payment settled (or your award claim).
        </div>
      )}
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
