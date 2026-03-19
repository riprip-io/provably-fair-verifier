# RipRip — Provably Fair Verifier

An open-source, 100% client-side tool to independently verify that RipRip pack opening results were computed honestly using the OPENv1 provably-fair RNG protocol.

**[Live Site](https://riprip-io.github.io/provably-fair-verifier/)**

## How to Use

### Epoch Verification (quick)

Verify that a revealed server secret matches its pre-published commitment hash:

1. Switch to the **Epoch Verification** tab
2. Paste the **Server Secret** (revealed after the epoch ends)
3. Paste the **Commit Hash** (published before any packs were opened)
4. Click **Verify Epoch** — you'll see VALID or INVALID

### Full Pack Opening Verification

Re-derive every draw from a pack opening:

1. On the **Full Verification** tab, click **Import Receipt** and paste the JSON blob exported from the RipRip webapp — this auto-fills all fields. Or fill them manually:

| Field | Where to find it |
|-------|-----------------|
| Server Secret | Revealed after the epoch ends |
| Commit Hash | Published before the epoch started |
| User ID | Your account profile |
| Client Seed | The seed you chose (or the default) |
| Purchase Nonce | Shown in your purchase receipt |
| Epoch ID | The epoch your purchase was in (YYYYMMDD) |
| Pack Config Hash | On-chain in the purchase transaction |
| Quantity | Number of packs in the batch |
| Draw Tables | The draw tables for your pack config |

2. Click **Verify Pack Opening**
3. Compare the results table (ticket numbers and selected SKUs) against what you received

## How It Works

RipRip uses **OPENv1**, an epoch-based commit-reveal scheme:

1. **Commit** — server publishes `SHA-256(serverSecret)` before the epoch starts
2. **Purchase** — your user ID, client seed, purchase nonce, and pack config are fixed at buy time
3. **Reveal** — after the epoch, the server secret is revealed
4. **Derive** — `HMAC-SHA256(serverSecret, message)` deterministically produces each draw's outcome
5. **Verify** — anyone can re-run the same computation and confirm identical results

The server cannot change the secret after committing, and you cannot change your inputs after purchasing. Neither party can influence the outcome.

## Auditing This Tool

This verifier is designed to be auditable:

- **100% client-side** — no data leaves your browser (verify in DevTools Network tab)
- **Minimal dependencies** — Preact (3KB), `@riprip-io/provably-fair`, and `@noble/hashes`
- **Self-test on load** — runs golden test vectors and shows PASS/FAIL before you use it
- **Open source** — clone this repo and inspect every line

## Running Locally

```bash
git clone https://github.com/riprip-io/provably-fair-verifier.git
cd provably-fair-verifier
npm install
npm run dev
```

Open `http://localhost:5173/provably-fair-verifier/` in your browser.

## License

[MIT](LICENSE)
