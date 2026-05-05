import { useMemo, useState } from 'preact/hooks';
import { EpochVerifier } from './components/epoch-verifier';
import { FullVerifier } from './components/full-verifier';
import { SelfTestBanner } from './components/self-test-banner';
import { AlgorithmSection } from './components/algorithm-section';
import { loadReceiptFromSearch } from './lib/url-receipt';

type Tab = 'epoch' | 'full';

export function App() {
  // RIP-753: external tools (e.g. the RipRip admintool) can deep-link
  // with `?receipt=<base64-json>`. Read once on mount — useMemo, not
  // useEffect, so the receipt is in place before FullVerifier first
  // mounts (avoids a render flash with empty fields).
  const urlReceipt = useMemo(
    () => loadReceiptFromSearch(typeof window !== 'undefined' ? window.location.search : ''),
    [],
  );
  const [tab, setTab] = useState<Tab>('full');

  return (
    <div class="max-w-3xl mx-auto px-4 py-8">
      <header class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight">
          RipRip — Provably Fair Verifier
        </h1>
        <p class="text-gray-400 mt-1 text-sm">
          Independently verify that your pack opening results were computed honestly.
        </p>
      </header>

      <SelfTestBanner />

      <nav class="flex gap-1 mb-6 border-b border-gray-800" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'full'}
          onClick={() => setTab('full')}
          class={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'full'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Full Verification
        </button>
        <button
          role="tab"
          aria-selected={tab === 'epoch'}
          onClick={() => setTab('epoch')}
          class={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'epoch'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Epoch Verification
        </button>
      </nav>

      <main>
        {tab === 'epoch' && <EpochVerifier />}
        {tab === 'full' && (
          <FullVerifier
            initialReceipt={urlReceipt.validation?.valid ? urlReceipt.validation.receipt : undefined}
            initialReceiptError={
              urlReceipt.present && urlReceipt.validation && !urlReceipt.validation.valid
                ? urlReceipt.validation.error
                : undefined
            }
          />
        )}
      </main>

      <AlgorithmSection />

      <footer class="mt-12 pt-6 border-t border-gray-800 text-gray-500 text-xs text-center">
        <p>
          100% client-side. No data leaves your browser.{' '}
          <a
            href="https://github.com/riprip-io/provably-fair-verifier"
            class="underline hover:text-gray-300"
            target="_blank"
            rel="noopener"
          >
            View source
          </a>
        </p>
      </footer>
    </div>
  );
}
