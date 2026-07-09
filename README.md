# Amora Protocol — x402 Dual-Gateway

An x402 micropayment gateway for the machine economy, deployed on Cloudflare Workers, with real C2PA content verification. Deployable from a phone.

**Live endpoint:** `https://x402-dual-gateway.andeglenderson.workers.dev`

---

## What This Is

The internet's traffic is increasingly machine-generated. Autonomous AI agents browse, query, and transact — and they need infrastructure priced and gated for them, not for browsers.

The Amora Protocol is an open-source gateway that sits at the intersection of two problems:

1. **Media trust** — is this asset what it claims to be, and who vouched for it?
2. **Economic friction** — did this agent incur a real financial cost to broadcast this data?

Both the payment layer and the core of the media-trust layer are live today.

---

## Architecture

```
src/
├── index.js        # Global request router — LIVE
├── payments.js      # x402 payment verification + ledger dispatch — LIVE
├── c2pa.js          # Trust Oracle — LIVE (real C2PA parsing/validation)
├── notary.js        # Economic Notary — STUB
└── test-c2pa.js      # Standalone test route, no payment gate — scaffolding
```

### Payment Layer — LIVE

`index.js` gates both `/verify` and `/stamp` behind a real x402 challenge/response loop:

- Requests without a valid `X-PAYMENT` header receive a proper 402 response with x402-spec payment requirements (scheme, network, asset, amount, `payTo`).
- Requests with a payment header are verified via `payments.js`, which builds an Ed25519-signed JWT and calls Coinbase's CDP facilitator (`api.cdp.coinbase.com`) to confirm settlement on Base mainnet before allowing the request through. This is a real, synchronous, blocking network call — not cached, not batched, not stateless.
- Only on successful verification does the router hand off to the endpoint logic.

### Endpoint A: `/verify` — The Trust Oracle — LIVE

**Question it answers:** *Is this piece of media cryptographically valid, and what does its manifest say?*

**Current state:** real, tested implementation using `@trustnxt/c2pa-ts`. On a successful payment:
- Fetches the target asset.
- Parses it via `createAsset()`.
- Extracts the embedded C2PA manifest (JUMBF box).
- Parses the manifest structure via `SuperBox` and `ManifestStore`.
- Runs `manifestStore.validate(asset)` — checks signature math, content hash matches, and timestamp validity.
- Returns a structured JSON result including the full validation status report.

**Confirmed, honest limitation:** this does **not** check the signing certificate against an external trust list. `@trustnxt/c2pa-ts`'s own README roadmap states chain-of-trust validation is not yet implemented in the library. A "verified" result means the manifest is internally consistent and the content is unmodified since signing — it does **not** confirm the signer's real-world identity or legitimacy against an authority. This limitation is stated explicitly in every `/verify` response.

**Also not yet detected:** Exclusion Range metadata manipulation — a separate, documented gap in the C2PA specification itself (not specific to this implementation), where certain metadata fields can be altered inside byte ranges the cryptographic signature is designed to skip. Affects all standard C2PA validators, not just this one.

**Untested:** PDF/document format support. All testing to date has used JPEG images only.

### Endpoint B: `/stamp` — The Economic Notary — STUB

**Intended question:** *Did this agent incur a real financial cost to broadcast this data?*

**Current state:** `handleStamp` accepts a `targetHash` field and returns a static JSON response confirming payment cleared. It does not generate a cryptographic attestation, does not sign anything, and does not write to a ledger beyond the standard payment ledger entry. It confirms only that payment was received.

### `/health`

Live. Returns gateway status and available endpoints. No payment required.

### `/.well-known/mcp/server-card.json`

Live. Serves an MCP server card describing `verify_provenance` and `notarize_content` as tools, for agent discovery.

### `/test-c2pa` — Test Scaffolding

Live, no payment required. A standalone route that exercises the same C2PA parsing/validation logic as `/verify` against a fixed test image, for debugging. Not part of the production request flow.

---

## The x402 Payment Flow (Live)

```
Agent → GET/POST /verify or /stamp
      ← 402 Payment Required + payment requirements
Agent → pays USDC on Base via x402 facilitator
      → retries with X-PAYMENT header
Worker → builds signed JWT, calls CDP facilitator to verify payment
       → on success, executes endpoint logic (real for /verify, stub for /stamp)
       → on success, fires ledger dispatch in background (does not block response)
      ← 200 + real verification result or stamp confirmation
```

Payments settle in USDC on Base mainnet. Payment verification is real and synchronous — every paid call makes a live network round-trip to the CDP facilitator before proceeding. This is the dominant cost in request latency today; no caching or batching optimization has been implemented.

---

## GitOps Ledger — CONNECTED

A GitHub Actions workflow (`ledger-sync.yml`) receives `repository_dispatch` events, updates `data/balances.json`, commits the change, and files a GitHub Issue on settlement failure.

**This is now wired and confirmed working.** `payments.js` fires a `repository_dispatch` event (`ledger_entry` on success, `settlement_failure` on failure) via `ctx.waitUntil()` after every payment attempt on `/verify` or `/stamp`. This has been tested live: confirmed producing real GitHub Actions runs and, on a deliberately malformed test payment, a real filed Issue.

The ledger write happens in the background and never blocks the response back to the agent.

---

## Deployment

Managed via GitHub Actions. No CLI required.

```yaml
# .github/workflows/deploy.yml
# Push to main → npm install → deployed to Cloudflare's edge
```

**Required secrets:**
- `CF_API_TOKEN` — Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `SETTLEMENT_WALLET` — Base mainnet USDC settlement address
- `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` — Coinbase CDP facilitator credentials
- `GITHUB_LEDGER_TOKEN` — GitHub PAT for ledger dispatch — confirmed working

**Key `package.json` dependencies:** `@trustnxt/c2pa-ts`, `reflect-metadata` (required polyfill for `tsyringe`, a dependency of `c2pa-ts` — must be imported first in `index.js`).

---

## Pricing

Flat **2000 USDC base units ($0.002)** per call on both `/verify` and `/stamp`. No tiered pricing exists in code.

---

## WASM Prototype — DISCONNECTED, NOT BUILDABLE

`edge/worker.js` contains an earlier, more ambitious draft of `/verify-provenance` logic — real payment verify/settle calls, a WASM-based provenance check, and a ledger write. It is **not** the deployed entry point (`wrangler.toml` points to `src/index.js`), it is self-gated off internally, and it currently cannot build — it imports `../pkg/amora_c2pa.js` and `../pkg/amora_c2pa_bg.wasm`, neither of which exist in this repo. A related workflow, `c2pa-spike.yml`, confirms the official `c2pa` Rust crate can compile to `wasm32-unknown-unknown`, but this was never connected to `edge/worker.js`. Treat this file as an abandoned reference draft, not a roadmap item — the live `/verify` implementation in `src/c2pa.js` uses a different (working, TypeScript-native) approach.

---

## Roadmap

### Phase 1 — Live
- ✅ Dual-endpoint router deployed on Cloudflare Workers
- ✅ x402 payment challenge/response loop, verified against CDP facilitator
- ✅ MCP server card live
- ✅ `/verify` — real C2PA manifest parsing and validation (signature, hash, timestamp)
- ✅ GitOps ledger — connected and confirmed firing on real requests
- 🔲 `/verify` — trust-list / chain-of-trust validation (known gap in underlying library)
- 🔲 `/verify` — Exclusion Range manipulation detection (known C2PA spec-wide gap)
- 🔲 `/stamp` — real attestation/signing logic (not yet built)

### Phase 2 — Notebook Stage / Unbuilt Concepts
- **Cert-Check (`/cert`):** proposed standalone status oracle cross-referencing signing keys against live CA revocation data. Stateful — requires ongoing CRL sync. Not started.
- **Exclusion-Guard (`/guard`):** proposed structural manifest parser to detect metadata migrated into unprotected exclusion-range byte intervals. Stateless. Not started.
- Velocity-based dynamic pricing ("Surge Escalator"): evaluated and deprioritized — Cloudflare's own Monetization Gateway now ships native compute-based variable pricing; a velocity-specific gap is unconfirmed and this is not an active direction.

### Phase 3 — Deferred
- Bonded on-chain escrow staking
- Trust-decay multiplier based on wallet maturity
- Out of scope until Phase 1 gaps above are closed.

---

## Design Principles

**Separation of concerns.** Media verification and economic friction are different problems. They share payment infrastructure but nothing else.

**Honest attestation.** Every response states precisely what was verified and what was not — including in the actual JSON payloads returned by `/verify`, not just in this document.

**Mobile-manageable.** The entire system — code, deployment, configuration — is managed from a phone via GitHub's mobile interface.

---

## Open Source & Licensing

This repository is open source. The live endpoint is operated by Ande Glenderson. Fork it, deploy your own instance, or contribute to the open engineering problems above.

---

## Built With

- [Cloudflare Workers](https://workers.cloudflare.com/) — V8 isolate edge runtime
- [x402 Protocol](https://x402.org) — HTTP 402 micropayment standard
- [C2PA](https://c2pa.org) — Content Authenticity and Provenance standard
- [@trustnxt/c2pa-ts](https://github.com/trustnxt/c2pa-ts) — C2PA parsing/validation library
- [Base](https://base.org) — L2 network for USDC settlement
- [Coinbase CDP](https://docs.cdp.coinbase.com/) — x402 payment facilitator

---

*Built and operated from Bahia, Brazil. Managed entirely from a mobile device.*
