import { validateDrawTablesJSON } from '../lib/validation';

const EXAMPLE = JSON.stringify(
  [
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
  null,
  2,
);

export function DrawTablesInput({
  value,
  onInput,
  error,
}: {
  value: string;
  onInput: (v: string) => void;
  error?: string;
}) {
  const validation = value.trim() ? validateDrawTablesJSON(value) : null;

  return (
    <label class="block">
      <span class="text-sm font-medium text-gray-300">Draw Tables JSON</span>
      <textarea
        value={value}
        onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)}
        placeholder={EXAMPLE}
        rows={10}
        class="mt-1 block w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-600 font-mono focus:outline-none focus:border-emerald-500"
        spellcheck={false}
      />
      {(error || (validation && !validation.valid)) && (
        <p class="mt-1 text-xs text-red-400">{error || validation?.error}</p>
      )}
      {validation?.valid && (
        <p class="mt-1 text-xs text-emerald-400">
          {validation.tables!.length} table(s),{' '}
          {validation.tables!.reduce((s, t) => s + t.drawsPerOpen, 0)} draw(s) per open
        </p>
      )}
    </label>
  );
}
