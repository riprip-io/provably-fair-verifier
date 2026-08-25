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
  V2_ENTROPY_TS,
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
    // NOTE: this suite is about verdict VISIBILITY, not the frozen goldens —
    // clientSeed differs from V2_FIXTURE_INPUTS, so V2_EXPECTED_DRAWS are
    // deliberately not reproduced here (openv2.test.ts covers those).
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

/**
 * Look a text input up by its visible label. Field renders
 * `<label><span>{label}</span><input/></label>`, so match on the label
 * element rather than on sibling position.
 */
function fieldByLabel(el: HTMLElement, label: string): HTMLInputElement {
  for (const l of Array.from(el.querySelectorAll('label'))) {
    if (l.querySelector('span')?.textContent?.trim() === label) {
      const input = l.querySelector('input');
      if (input) return input as HTMLInputElement;
    }
  }
  throw new Error(`field not found: ${label}`);
}

function typeInto(el: HTMLElement, label: string, value: string): void {
  const input = fieldByLabel(el, label);
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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

  describe('no commitment supplied', () => {
    it('says the epoch was NOT CHECKED rather than silently omitting a verdict', () => {
      // The commit hash is optional. Before RIP-1237 its absence produced a
      // green-looking results table with no verdict anywhere — the same
      // "absence reads as success" failure, in the other direction.
      const { commitHash: _omit, ...rest } = v1Receipt();
      const el = mount(rest as VerificationReceipt);
      clickVerify(el);

      const text = output(el);
      expect(text).toContain('Epoch: NOT CHECKED');
      expect(text).not.toContain('Epoch: VALID');
      // Draws ARE still replayed — the check was skipped, not failed.
      expect(hasResultsTable(el)).toBe(true);
    });
  });

  describe('stale output', () => {
    it('drops a standing verdict as soon as an input is edited', () => {
      const el = mount(v1Receipt());
      clickVerify(el);
      expect(output(el)).toContain('Epoch: VALID');

      typeInto(el, 'Purchase Nonce', '43');

      const text = output(el);
      expect(text).not.toContain('Epoch: VALID');
      expect(hasResultsTable(el)).toBe(false);
    });

    it('drops a standing verdict when the protocol version is switched', () => {
      const el = mount(v1Receipt());
      clickVerify(el);
      expect(output(el)).toContain('Epoch: VALID');

      const select = el.querySelector('select');
      if (!select) throw new Error('version select not found');
      act(() => {
        select.value = 'OPENv2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(output(el)).not.toContain('Epoch: VALID');
      expect(hasResultsTable(el)).toBe(false);
    });
  });

  it('shows a green epoch verdict beside a FAILED beacon, with no draws', () => {
    // The one case where two verdicts legitimately coexist: the reveal is
    // honest but the drand beacon is not authentic.
    const el = mount(v2Receipt({ drandRandomness: 'a'.repeat(64) }));
    clickVerify(el);

    const text = output(el);
    expect(text).toContain('Epoch: VALID');
    expect(text).toContain('drand beacon FAILED authentication');
    expect(hasResultsTable(el)).toBe(false);
  });

  it('re-verifying after fixing the secret clears the INVALID verdict', () => {
    const el = mount(v1Receipt({ serverSecret: TAMPERED_SECRET }));
    clickVerify(el);
    expect(output(el)).toContain('Epoch: INVALID');

    typeInto(el, 'Server Secret', SERVER_SECRET);
    clickVerify(el);

    const text = output(el);
    expect(text).toContain('Epoch: VALID');
    expect(text).not.toContain('Epoch: INVALID');
    expect(hasResultsTable(el)).toBe(true);
  });
});
