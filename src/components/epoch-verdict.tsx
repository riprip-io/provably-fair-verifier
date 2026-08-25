/**
 * The epoch commit-reveal verdict — ONE renderer, shared by both surfaces.
 *
 * RIP-1237: this deliberately does NOT live inside a results component.
 * A failed reveal stops verification before any draws exist, so a verdict
 * owned by a results component is unreachable in exactly the case that
 * matters most. That was the bug; keeping the verdict in its own component,
 * rendered outside any `results &&` guard, is what makes it impossible.
 *
 * It is shared with the standalone Epoch Verification tab because both
 * surfaces render the same invariant — `sha256(serverSecret) === commitHash`
 * — and had already drifted: the standalone tab used different wording and
 * omitted the published hash entirely, so the simpler surface explained
 * less than the complex one.
 */

export type EpochVerdictStatus = 'valid' | 'invalid' | 'skipped';

export interface EpochVerdict {
  status: EpochVerdictStatus;
  /** sha256(serverSecret) — what the supplied secret actually hashes to. */
  computedHash?: string;
  /** The published commitment that was checked, as bare lowercase hex. */
  commitHash?: string;
}

const STYLES: Record<EpochVerdictStatus, string> = {
  valid: 'bg-emerald-900/40 border-emerald-700 text-emerald-300',
  invalid: 'bg-red-900/40 border-red-700 text-red-300',
  skipped: 'bg-amber-900/30 border-amber-700 text-amber-300',
};

const LABELS: Record<EpochVerdictStatus, string> = {
  valid: 'Epoch: VALID',
  invalid: 'Epoch: INVALID',
  skipped: 'Epoch: NOT CHECKED',
};

export function EpochVerdictBanner({ verdict }: { verdict: EpochVerdict }) {
  const { status, computedHash, commitHash } = verdict;
  return (
    <div
      // Verification mutates the page in place with no focus change, so a
      // screen reader would otherwise never announce the tool's headline
      // output. A failed reveal is assertive; the rest is polite.
      role={status === 'invalid' ? 'alert' : 'status'}
      class={`mt-4 p-3 rounded border text-sm space-y-2 ${STYLES[status]}`}
    >
      <div class="font-semibold">{LABELS[status]}</div>

      {status === 'valid' && (
        <div class="text-xs text-emerald-200">
          The revealed server secret hashes to the commitment that was published before
          this epoch began, so it is the secret that was committed to.
        </div>
      )}
      {status === 'invalid' && (
        <div class="text-xs text-red-200">
          The revealed server secret does not hash to the published commit hash, so it is
          not the secret that was committed to before this epoch began. Draws were not
          replayed.
        </div>
      )}
      {status === 'skipped' && (
        <div class="text-xs text-amber-200">
          No commit hash was supplied, so the commit-reveal step was skipped. Any draws
          shown were replayed from the server secret exactly as entered — nothing here
          proves that secret was fixed before the purchase. Supply the published commit
          hash to check it.
        </div>
      )}

      {(computedHash || commitHash) && (
        // The two values the user is being asked to compare, at readable
        // contrast on every background. break-all is scoped to the values so
        // the labels cannot wrap mid-word on narrow viewports.
        <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs font-mono">
          {computedHash && (
            <>
              <span class="text-gray-400 whitespace-nowrap">sha256(server secret)</span>
              <span class="text-gray-200 break-all">{computedHash}</span>
            </>
          )}
          {commitHash && (
            <>
              <span class="text-gray-400 whitespace-nowrap">published commit hash</span>
              <span class="text-gray-200 break-all">{commitHash}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
