import { useState } from 'preact/hooks';
import { parseReceipt, type VerificationReceipt } from '../lib/receipt';

export function ReceiptImport({
  onImport,
}: {
  onImport: (receipt: VerificationReceipt) => void;
}) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState('');
  const [error, setError] = useState('');

  function handleImport() {
    setError('');
    const result = parseReceipt(json);
    if (!result.valid) {
      setError(result.error!);
      return;
    }
    onImport(result.receipt!);
    setJson('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        class="mb-4 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors"
      >
        Import Receipt
      </button>
    );
  }

  return (
    <div class="mb-4 p-4 bg-gray-900 border border-gray-700 rounded space-y-3">
      <p class="text-sm text-gray-300">
        Paste the verification receipt JSON exported from the RipRip webapp:
      </p>
      <textarea
        value={json}
        onInput={(e) => setJson((e.target as HTMLTextAreaElement).value)}
        placeholder='{"version": 1, "serverSecret": "...", ...}'
        rows={8}
        class="block w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded text-sm text-gray-100 font-mono focus:outline-none focus:border-emerald-500"
        spellcheck={false}
        autoFocus
      />
      {error && <p class="text-xs text-red-400">{error}</p>}
      <div class="flex gap-2">
        <button
          onClick={handleImport}
          class="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
        >
          Import
        </button>
        <button
          onClick={() => { setOpen(false); setJson(''); setError(''); }}
          class="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
