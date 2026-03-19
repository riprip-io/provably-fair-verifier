import { useState } from 'preact/hooks';

export function AlgorithmSection() {
  const [open, setOpen] = useState(false);

  return (
    <section class="mt-10">
      <button
        onClick={() => setOpen(!open)}
        class="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
        aria-expanded={open}
      >
        <span class={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>
          &#9654;
        </span>
        How the Algorithm Works
      </button>

      {open && (
        <div class="mt-4 space-y-4 text-sm text-gray-400 leading-relaxed">
          <div>
            <h3 class="font-medium text-gray-200">1. Epoch Commitment</h3>
            <p>
              Before any packs are opened, the server generates a random 32-byte secret and
              publishes its SHA-256 hash (the "commit hash"). This commit cannot be changed later.
              After the epoch ends, the server reveals the secret so anyone can verify it matches.
            </p>
          </div>

          <div>
            <h3 class="font-medium text-gray-200">2. Message Construction</h3>
            <p>
              For each draw, a deterministic 122-byte message is built from: the "OPENv1" tag,
              epoch ID, user key (SHA-256 of your user ID), purchase nonce, pack config hash,
              open index, draw index, and client seed hash. Every input is fixed before the
              server secret is revealed, making the outcome pre-determined but unknowable.
            </p>
          </div>

          <div>
            <h3 class="font-medium text-gray-200">3. Ticket Generation</h3>
            <p>
              HMAC-SHA256 is computed using the server secret as the key and the message as input.
              The first 8 bytes of the output are read as a little-endian 64-bit integer, then
              reduced to the range 0–999,999. This produces a uniformly distributed "ticket"
              number for display.
            </p>
          </div>

          <div>
            <h3 class="font-medium text-gray-200">4. Weighted Selection</h3>
            <p>
              The ticket determines which item you receive. Each item in the draw table has a
              weight. The algorithm uses rejection sampling to ensure perfectly uniform
              distribution (no modulo bias). It computes successive HMAC values until one falls
              within the unbiased range, then maps it to an item based on cumulative weights.
            </p>
          </div>

          <div>
            <h3 class="font-medium text-gray-200">5. Verifiability</h3>
            <p>
              Because the server secret is committed before pack openings and all other inputs
              (user ID, client seed, purchase nonce, draw tables) are fixed at purchase time,
              neither the server nor the user can influence the outcome. Anyone can re-run the
              same deterministic computation and verify they get identical results.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
