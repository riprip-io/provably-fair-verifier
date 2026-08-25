import type { OpenBatchResult } from '@riprip-io/provably-fair';

/**
 * Draw results only. The epoch verdict deliberately does NOT live here:
 * a failed commit-reveal stops verification before any results exist, so a
 * banner owned by this component is unreachable in exactly the case that
 * matters most. It is rendered by `EpochCheckBanner` in full-verifier.tsx
 * (RIP-1237).
 */
export function ResultsDisplay({
  results,
  intermediates,
}: {
  results: OpenBatchResult;
  intermediates?: { userKey: string; clientSeedHash: string } | null;
}) {
  return (
    <div class="mt-6 space-y-4">
      {intermediates && (
        <details class="text-xs text-gray-500">
          <summary class="cursor-pointer text-gray-400 hover:text-gray-300">
            Intermediate values
          </summary>
          <div class="mt-2 space-y-1 break-all font-mono">
            <p>
              <span class="text-gray-400">userKey: </span>
              {intermediates.userKey}
            </p>
            <p>
              <span class="text-gray-400">clientSeedHash: </span>
              {intermediates.clientSeedHash}
            </p>
          </div>
        </details>
      )}

      {results.results.map((openResult) => (
        <div key={openResult.openIndex} class="border border-gray-800 rounded overflow-hidden">
          <div class="px-3 py-2 bg-gray-900 text-sm font-medium text-gray-300">
            Pack Open #{openResult.openIndex + 1}
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
                <th class="px-3 py-2">Draw</th>
                <th class="px-3 py-2">Ticket</th>
                <th class="px-3 py-2">Selected SKU</th>
                <th class="px-3 py-2">Retries</th>
              </tr>
            </thead>
            <tbody>
              {openResult.draws.map((draw) => (
                <tr key={draw.drawIndex} class="border-b border-gray-800/50">
                  <td class="px-3 py-2 text-gray-400">{draw.drawIndex}</td>
                  <td class="px-3 py-2 font-mono">{draw.ticket}</td>
                  <td class="px-3 py-2 font-medium text-emerald-400">
                    {draw.selectedItem}
                  </td>
                  <td class="px-3 py-2 text-gray-500">{draw.rejectionSamples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
