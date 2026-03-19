import { useState } from 'preact/hooks';
import { verifyEpoch, commitEpoch } from '@riprip-io/provably-fair';
import { parseHex, bytesToHex } from '../lib/hex';
import { isValidHex64 } from '../lib/validation';

interface EpochResult {
  valid: boolean;
  computedHash: string;
}

export function EpochVerifier() {
  const [serverSecret, setServerSecret] = useState('');
  const [commitHash, setCommitHash] = useState('');
  const [result, setResult] = useState<EpochResult | null>(null);
  const [error, setError] = useState('');

  function handleVerify() {
    setResult(null);
    setError('');

    if (!isValidHex64(serverSecret)) {
      setError('Server Secret must be 64 hex characters');
      return;
    }
    if (!isValidHex64(commitHash)) {
      setError('Commit Hash must be 64 hex characters');
      return;
    }

    try {
      const secretBytes = parseHex(serverSecret);
      const hashBytes = parseHex(commitHash);
      const computed = commitEpoch(secretBytes);
      const valid = verifyEpoch(secretBytes, hashBytes);

      setResult({ valid, computedHash: bytesToHex(computed) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
  }

  return (
    <div>
      <p class="text-sm text-gray-400 mb-4">
        Verify that a revealed server secret matches the epoch commitment hash
        that was published before any packs were opened.
      </p>

      <div class="space-y-4">
        <Field
          label="Server Secret"
          value={serverSecret}
          onInput={setServerSecret}
          placeholder="64 hex characters (the revealed secret)"
        />
        <Field
          label="Commit Hash"
          value={commitHash}
          onInput={setCommitHash}
          placeholder="64 hex characters (published before epoch started)"
        />

        <button
          onClick={handleVerify}
          class="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition-colors"
        >
          Verify Epoch
        </button>
      </div>

      {error && (
        <div class="mt-4 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div class="mt-4 space-y-3">
          <div
            class={`p-4 rounded font-medium text-center text-lg ${
              result.valid
                ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300'
                : 'bg-red-900/40 border border-red-700 text-red-300'
            }`}
          >
            {result.valid ? 'VALID — Epoch commitment matches' : 'INVALID — Hashes do not match'}
          </div>
          <div class="text-xs text-gray-500 break-all">
            <span class="text-gray-400">Computed hash: </span>
            {result.computedHash}
          </div>
        </div>
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
