/**
 * @vitest-environment jsdom
 *
 * RIP-1237 regression: a FAILED epoch commit-reveal check must always
 * render a visible verdict.
 *
 * The defect this pins was invisible at the logic layer — `handleVerify`
 * already called `setEpochCheck({ valid: false, ... })` correctly. The
 * verdict was lost purely in the render tree, because the banner lived
 * inside `<ResultsDisplay>` and the `!valid` early-return leaves
 * `results === null`, so nothing mounted. Only a DOM-level assertion
 * catches that, which is why this suite renders the real component.
 *
 * jsdom is opted into per-file (the lib suites stay on the node
 * environment, which is where their DecompressionStream usage works).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { commitEpoch } from '@riprip-io/provably-fair';
import { FullVerifier } from '../full-verifier';
import { bytesToHex, parseHex } from '../../lib/hex';
import type { VerificationReceipt } from '../../lib/receipt';
import {
  V2_DRAND_ROUND,
  V2_DRAND_RANDOMNESS_HEX,
  V2_DRAND_SIGNATURE_HEX,
} from '../../lib/__fixtures__/openv2-vectors';

// ── Minimal hand-built fixtures (no staging receipts needed) ──

const SERVER_SECRET = '01'.repeat(32);
/** The honest commitment: sha256(serverSecret), per OPENv1 commit-reveal. */
const COMMIT_HASH = bytesToHex(commitEpoch(parseHex(SERVER_SECRET)));

/**
 * One hex nibble flipped in the LAST byte of the server secret. Everything
 * else — including commitHash — is the honest receipt, so this models
 * exactly the tamper case: a revealed secret that does not open the
 * published commitment.
 */
const TAMPERED_SECRET = `${SERVER_SECRET.slice(0, -1)}2`;

/**
 * quicknet round rule: round = floor((ts - genesis) / 3) + 2. This is the
 * timestamp for which V2_DRAND_ROUND (1000) is the first round published
 * strictly after it, so `checkEntropy` passes on the untampered path.
 */
const V2_ENTROPY_TS = 1692806361;

function baseReceipt(): VerificationReceipt {
  return {
    version: 1,
    serverSecret: SERVER_SECRET,
    commitHash: COMMIT_HASH,
    epochId: 20260210,
    userId: '550e8400-e29b-41d4-a716-446655440000',
    clientSeed: 'd'.repeat(64),
    purchaseNonce: 42,
    packConfigHash: 'bb'.repeat(32),
    quantity: 1,
    drawTables: [
      {
        drawId: 0,
        drawsPerOpen: 3,
        items: [
          { sku: 'COMMON', weight: 700 },
          { sku: 'UNCOMMON', weight: 200 },
          { sku: 'RARE', weight: 100 },
        ],
      },
    ],
  };
}

function v1Receipt(overrides: Partial<VerificationReceipt> = {}): VerificationReceipt {
  return { ...baseReceipt(), ...overrides };
}

function v2Receipt(overrides: Partial<VerificationReceipt> = {}): VerificationReceipt {
  return {
    ...baseReceipt(),
    version: 2,
    entropyTs: V2_ENTROPY_TS,
    drandRound: V2_DRAND_ROUND,
    drandRandomness: V2_DRAND_RANDOMNESS_HEX,
    drandSignature: V2_DRAND_SIGNATURE_HEX,
    ...overrides,
  };
}

// ── Harness ──

let container: HTMLDivElement | null = null;

afterEach(() => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
});

function mount(receipt: VerificationReceipt): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    render(<FullVerifier initialReceipt={receipt} />, container!);
  });
  return container;
}

function clickVerify(el: HTMLElement): void {
  const button = Array.from(el.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Verify Pack Opening'),
  );
  if (!button) throw new Error('Verify Pack Opening button not found');
  act(() => {
    button.click();
  });
}

/** Everything the component rendered below the form. */
function output(el: HTMLElement): string {
  return el.textContent ?? '';
}

function hasResultsTable(el: HTMLElement): boolean {
  return el.querySelector('table') !== null;
}

describe('FullVerifier — epoch verdict visibility (RIP-1237)', () => {
  describe('OPENv1', () => {
    it('shows Epoch: VALID and the draw table for an honest receipt', () => {
      const el = mount(v1Receipt());
      clickVerify(el);

      expect(output(el)).toContain('Epoch: VALID');
      expect(hasResultsTable(el)).toBe(true);
    });

    it('shows Epoch: INVALID — never a blank page — when the server secret does not open the commitment', () => {
      const el = mount(v1Receipt({ serverSecret: TAMPERED_SECRET }));
      clickVerify(el);

      const text = output(el);
      // The regression: this used to render nothing at all.
      expect(text).toContain('Epoch: INVALID');
      expect(text).not.toContain('Epoch: VALID');
      // Draws must NOT be replayed against a secret that failed reveal.
      expect(hasResultsTable(el)).toBe(false);
    });

    it('shows what the tampered secret actually hashes to, next to the published commitment', () => {
      const el = mount(v1Receipt({ serverSecret: TAMPERED_SECRET }));
      clickVerify(el);

      const computed = bytesToHex(commitEpoch(parseHex(TAMPERED_SECRET)));
      expect(computed).not.toBe(COMMIT_HASH);

      const text = output(el);
      expect(text).toContain(computed);
      expect(text).toContain(COMMIT_HASH);
    });
  });

  describe('OPENv2', () => {
    it('shows Epoch: VALID, an authenticated beacon and the draw table for an honest receipt', () => {
      const el = mount(v2Receipt());
      clickVerify(el);

      const text = output(el);
      expect(text).toContain('Epoch: VALID');
      expect(text).toContain('drand beacon authenticated');
      expect(hasResultsTable(el)).toBe(true);
    });

    it('shows Epoch: INVALID — never a blank page — when the server secret does not open the commitment', () => {
      const el = mount(v2Receipt({ serverSecret: TAMPERED_SECRET }));
      clickVerify(el);

      const text = output(el);
      expect(text).toContain('Epoch: INVALID');
      expect(hasResultsTable(el)).toBe(false);
      // Epoch is checked before the beacon, so beacon authentication must
      // not have run — a green beacon panel beside a failed reveal would
      // read as partial success. (Matched on the panel's verdict strings,
      // not the bare words: the form itself labels fields "drand ...".)
      expect(text).not.toContain('drand beacon authenticated');
      expect(text).not.toContain('drand beacon FAILED authentication');
    });
  });

  it('re-verifying after fixing the secret clears the INVALID verdict', () => {
    const el = mount(v1Receipt({ serverSecret: TAMPERED_SECRET }));
    clickVerify(el);
    expect(output(el)).toContain('Epoch: INVALID');

    const secretField = Array.from(el.querySelectorAll('input')).find(
      (i) => i.previousSibling?.textContent === 'Server Secret',
    );
    if (!secretField) throw new Error('Server Secret field not found');
    act(() => {
      secretField.value = SERVER_SECRET;
      secretField.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickVerify(el);

    const text = output(el);
    expect(text).toContain('Epoch: VALID');
    expect(text).not.toContain('Epoch: INVALID');
    expect(hasResultsTable(el)).toBe(true);
  });
});
