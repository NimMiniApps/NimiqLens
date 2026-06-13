# NimLens — Design Spec

**Date:** 2026-06-13
**Status:** Approved for planning

## 1. Overview

NimLens is a mobile-first Nimiq Pay Mini App that acts as a "price lens" for real-world shopping. A user enters or scans a fiat price (EUR, USD, GBP, CHF) and instantly sees the equivalent value in NIM, USDT, BTC, and ETH. If the user connects their Nimiq Pay wallet, NimLens also shows whether their current NIM balance covers the price.

NimLens is open source (MIT), does not custody funds, does not handle seed phrases, and only requests wallet access on explicit user action.

## 2. Architecture

```
NimLens/
├── frontend/
│   ├── Vue 3 + TypeScript + Vite + Tailwind CSS
│   ├── @nimiq/mini-app-sdk
│   ├── Pinia (walletStore, ratesStore)
│   ├── Vue Router (5 routes)
│   └── Tesseract.js (lazy-loaded, OCR)
├── backend/
│   ├── Go REST API (net/http or chi)
│   ├── Rate fetcher + 60s in-memory cache (CoinGecko)
│   ├── NIM balance proxy (Nimiq RPC)
│   └── /api/health
├── docs/
│   ├── submission.md
│   ├── privacy.md
│   └── dev-guide.md
├── docker-compose.yml
├── .env.example
├── LICENSE (MIT)
└── README.md
```

The frontend never calls third-party rate APIs directly — all rate data is normalized by the Go backend. The frontend talks to the Nimiq Pay providers directly for wallet operations (per Mini App rules — wallet ops must go through injected providers, not a backend).

## 3. Frontend: routes & screens

Vue Router with 5 routes, one per screen from the brief:

| Route | Screen | Purpose |
|---|---|---|
| `/` | Welcome | Explainer, Connect Wallet, Start Manual, Start Scan |
| `/convert` | Converter | Price input, currency selector, conversion cards, balance/affordability |
| `/scan` | Camera Scan | Camera preview, scan, detected price, confirm/edit |
| `/rates` | Rates | Current rates table, timestamp, source attribution |
| `/about` | About | Nimiq Pay integration explanation, privacy, MIT license, GitHub link |

**State (Pinia):**
- `walletStore`: `isInsideNimiqPay`, `provider` instance, `address`, `nimBalance`, `balanceError`
- `ratesStore`: `rates`, `fetchedAt`, `stale`, `fetchError`

## 4. Nimiq Pay integration

- **Init**: on app mount, `init({ timeout: 10_000 })` from `@nimiq/mini-app-sdk`. Success sets `isInsideNimiqPay = true`. Failure/timeout sets it `false` — the app remains fully usable (manual conversion works standalone in a regular browser for local development).
- **Connect wallet**: "Connect Wallet" is a button press (explicit user action) that calls `listAccounts()`. The first returned address is stored and displayed in shortened form, e.g. `NQ07 **** **** 6789`.
- **NIM balance**: the Nimiq provider SDK has no balance-read method. NimLens reads NIM balance via the backend, which proxies the connected address to a public Nimiq RPC node's `getAccountByAddress` method and converts Luna → NIM.
  - RPC endpoint: `https://rpc-mainnet.nimiqscan.com`, configurable via `NIMIQ_RPC_URL`.
  - If the RPC call fails, the Converter screen shows "Balance unavailable" in place of the affordability result; conversions still work.
- **Tip / support button**: shown only when `isInsideNimiqPay && address` is set. On explicit press, calls `sendBasicTransactionWithData({ recipient: <VITE_TIP_ADDRESS>, value, data: "NimLens tip" })`. Recipient address is a placeholder env var (`VITE_TIP_ADDRESS`) — real address to be supplied before submission. Never fires automatically.
- **Language**: `window.nimiqPay.language` is read into `walletStore` for future i18n; not used for UI text in v1 (English only), but wired so adding translations later doesn't require touching the provider layer.
- **Approval-dialog discipline**: only `listAccounts()` and `sendBasicTransactionWithData()` require confirmation, and both are gated behind explicit button presses with no automatic chaining.

## 5. Backend API

### `GET /api/rates`
Fetches `https://api.coingecko.com/api/v3/simple/price?ids=nimiq,bitcoin,ethereum,tether&vs_currencies=eur,usd,gbp,chf`, normalizes into:

```json
{
  "rates": {
    "NIM":  { "EUR": 0.0123, "USD": 0.0134, "GBP": 0.0105, "CHF": 0.0119 },
    "USDT": { "EUR": 0.92,   "USD": 1.00,   "GBP": 0.79,   "CHF": 0.88 },
    "BTC":  { "EUR": 58000,  "USD": 63000,  "GBP": 50000,  "CHF": 56000 },
    "ETH":  { "EUR": 3200,   "USD": 3500,   "GBP": 2800,   "CHF": 3100 }
  },
  "timestamp": "2026-06-13T16:30:00Z",
  "fetched_at": "2026-06-13T16:29:42Z",
  "stale": false,
  "source": "CoinGecko"
}
```

- In-memory cache, 60s TTL.
- On upstream failure with an existing cache entry: serve the cached value with `"stale": true`.
- On upstream failure with no cache entry yet: `503` with a JSON error body.

### `GET /api/health`
Returns `{"status": "ok"}`.

### `GET /api/balance/:address`
Proxies `getAccountByAddress` on `NIMIQ_RPC_URL` for the given NIM address, returns `{ "address": "...", "balance_nim": 123.45 }`. Read-only, no caching needed (or a very short cache, e.g. 10s, to avoid hammering the RPC on repeated UI renders).

No `/api/ocr` endpoint — OCR is fully client-side (§7), so this is omitted entirely.

## 6. Conversion logic

```
assetAmount = fiatAmount / rates[asset][fiatCurrency]
```

Formatting:
- NIM: 4 decimals if `assetAmount < 1`, else 2 decimals
- USDT: 2 decimals
- BTC: 8 decimals
- ETH: 6 decimals

All results are prefixed with `≈` to signal approximation. No "guaranteed rate" language anywhere in the UI.

**Affordability** (only shown when wallet connected and balance available):
- `nimBalance >= nimAmount` → "You can afford this with your NIM balance"
- else → "You need ≈X more NIM"

## 7. Camera / OCR (in scope for v1)

- Camera screen: "Scan" button triggers `getUserMedia({ video: { facingMode: 'environment' } })`. Camera access only ever requested on this explicit action.
- Captured frame → canvas → **Tesseract.js**, dynamically imported only when the scan screen is opened (keeps it out of the main bundle).
- Recognized text is scanned with regexes for price-like patterns: `€12.99`, `12,99 EUR`, `$24.50`, `24.50 USD`, `£`, `CHF`/`Fr.`, etc. The highest-confidence match is selected.
- Result is shown as "Detected: €12.99 — is this correct?" with **Confirm** (sends to Converter) or **Edit** (manual override). Nothing is converted without confirmation.
- "Enter manually" is always available as a fallback if detection fails, camera permission is denied, or the device has no camera.
- **Privacy**: frames are processed entirely on-device; no image or frame is ever uploaded or stored. This is stated on the scan screen and in `docs/privacy.md` / About screen.

## 8. Stale-rate handling

A non-blocking inline banner appears near the rates display whenever `stale: true` or `fetched_at` is more than 60s old:

> "Rates from {relative time} ago — may be outdated"

Conversions continue to be computed from the cached rates; nothing is blocked. If no rates have ever been successfully fetched (first load, backend down), the Converter shows a clear "Rates unavailable — try again later" state instead of numbers, but manual price entry UI remains visible.

## 9. Compliance & repo contents

- `LICENSE`: MIT.
- `.env.example`: `VITE_TIP_ADDRESS=NQ00 0000 0000 0000 0000 0000 0000 0000 0000` (placeholder), `VITE_API_BASE_URL`, `NIMIQ_RPC_URL=https://rpc-mainnet.nimiqscan.com`, `COINGECKO_API_BASE=https://api.coingecko.com/api/v3`.
- `docs/privacy.md`: explains camera/OCR is local-only, no image storage, no tracking, what wallet data is read (address + balance, only on connect).
- `docs/submission.md`: contains the ≤250-word submission description (§11).
- `docs/dev-guide.md`: local dev setup, LAN access for phone testing, `docker-compose` usage.
- README and About screen credit CoinGecko (rates) and Tesseract.js (OCR), with links.

## 10. Testing plan

- Mobile viewport (375px width) testing for all 5 screens.
- Virtual Android device (mobile MCP) pass for layout and touch targets.
- SDK `init()` tested both inside Nimiq Pay (via LAN URL) and in a regular browser (provider absent → graceful message).
- Manual conversion: all 4 fiat currencies × all 4 assets, decimal formatting per §6.
- Stale-rate banner: simulate backend down / cache-expired and confirm non-blocking banner + cached values still shown.
- Wallet connect: `listAccounts()` flow, address shortening, balance fetch via `/api/balance/:address`, and the "balance unavailable" fallback.
- Affordability calculation correctness against known balance/price combinations.
- Tip transaction flow: confirm `sendBasicTransactionWithData` only fires on explicit button press, never on load.
- OCR: confirm camera permission prompt only on user action, detection of sample price strings, confirm/edit flow, and "enter manually" fallback.
- Final pass: run the Mini Apps `checklist.md` (provider integration, mobile UI, security, error handling, approval-dialog UX, dev server/LAN setup, visual identity) before submission.

## 11. Submission description (draft, ≤250 words)

> **NimLens — see real-world prices in crypto, instantly.**
>
> NimLens is a Nimiq Pay Mini App that turns any fiat price into its equivalent in NIM, USDT, BTC, and ETH. Enter a price (or scan a price tag, receipt, or menu with your camera), pick your currency — EUR, USD, GBP, or CHF — and NimLens shows you what it's worth across major crypto assets in real time.
>
> It's built for everyday Nimiq Pay users who want a quick mental model of crypto value while shopping, comparing prices, or just curious what something costs "in NIM." Connect your wallet (one tap, via Nimiq Pay's account access) and NimLens tells you whether your current NIM balance covers the price — no guesswork.
>
> NimLens integrates with Nimiq Pay through the official Mini App SDK: wallet connection via `listAccounts()`, balance checks via a public Nimiq RPC, and an optional one-tap tip to support development via `sendBasicTransactionWithData()`. NimLens never accesses private keys, never handles seed phrases, and never custodies funds — every sensitive action goes through Nimiq Pay's native approval dialogs.
>
> Camera scanning runs OCR entirely on-device (Tesseract.js) — no images are ever uploaded or stored, and detected prices always require user confirmation before conversion.
>
> Exchange rates are sourced from CoinGecko via a small backend that normalizes and caches data for 60 seconds, with clear on-screen warnings if rates go stale.
>
> NimLens is fully open source under the MIT license.

## 12. Phased implementation plan

**Phase 1 — Backend foundation**
Go REST API: `/api/health`, `/api/rates` (CoinGecko fetch + normalize + 60s cache + staleness), `/api/balance/:address` (Nimiq RPC proxy via `rpc-mainnet.nimiqscan.com`). Dockerfile + docker-compose for backend. Unit tests for cache/staleness logic and rate normalization.

**Phase 2 — Frontend scaffold & converter (manual flow)**
Vite + Vue 3 + TS + Tailwind scaffold, `@nimiq/mini-app-sdk` install + `init()` with error handling, Vue Router + 5 route shells, Pinia stores. Welcome and Converter screens fully working against the live backend: price input, currency selector, 4 conversion cards, stale-rate banner. Rates screen. Verified on a phone via Nimiq Pay LAN connection (`isConsensusEstablished()` smoke test).

**Phase 3 — Wallet integration**
Connect Wallet flow (`listAccounts()`, shortened address display), NIM balance fetch via `/api/balance/:address`, affordability logic and UI on Converter screen, "balance unavailable" fallback path.

**Phase 4 — Camera / OCR**
Camera scan screen, `getUserMedia` permission flow, lazy-loaded Tesseract.js, price-pattern regex extraction, confirm/edit UI, manual-entry fallback, privacy messaging.

**Phase 5 — Tip button, docs & compliance**
Support/tip button (`sendBasicTransactionWithData`, placeholder address via env), About screen, `LICENSE`, `.env.example`, `docs/privacy.md`, `docs/submission.md`, `docs/dev-guide.md`, README.

**Phase 6 — Testing & submission**
Mobile viewport + virtual Android device pass, full test plan from §10, run the Mini Apps `checklist.md`, fix any failures, final submission prep.

Each phase is independently testable and shippable as an incremental Mini App build — Phase 2 alone already produces a usable manual converter inside Nimiq Pay.
