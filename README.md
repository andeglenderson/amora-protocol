# Amora Protocol — x402 Dual-Gateway

An x402 micropayment gateway for the machine economy, deployed on Cloudflare Workers. Two planned endpoints, one live payment layer. Deployable from a phone.

**Live endpoint:** `https://x402-dual-gateway.andeglenderson.workers.dev`

---

## What This Is

The internet's traffic is increasingly machine-generated. Autonomous AI agents browse, query, and transact — and they need infrastructure priced and gated for them, not for browsers.

The Amora Protocol is an open-source gateway that sits at the intersection of two problems:

1. **Media trust** — is this asset what it claims to be, and who vouched for it?
2. **Economic friction** — did this agent incur a real financial cost to broadcast this data?

The payment layer solving problem #2 is live today. The content-aware logic solving problem #1 is in active development.

---

## Architecture

The gateway runs as a single Cloudflare Worker with two endpoints sharing one x402 payment infrastructure.

```
src/
├── index.js        # Global request router — LIVE
├── payments.js      # x402 payment verification via CDP facilitator — LIVE
├── c2pa.js          # Trust Oracle — STUB
└── notary.js        # Economic Notary — STUB
```

### Payment Layer — LIVE

`index.js` gates both `/verify` and `/stamp` behind a real x402 challenge/response loop:

- Requests without a valid `X-PAYMENT` header receive a proper 402 response with x402-spec payment requirements (scheme, network, asset, amount, `payTo`).
- Requests with a payment header are verified via `payments.js`, which builds an Ed25519-signed JWT and calls Coinbase's CDP facilitator (`api.cdp.coinbase.com`) to confirm settlement on Base mainnet before allowing the request through.
- Only on successful verification does the router hand off to the endpoint logic.

This part of the stack is real, functional, and independently confirmed against source.

### Endpoint A: `/verify` — The Trust Oracle (STUB)

**Intended question:** *Is this piece of media cryptographically valid, and who signed it?*

**Current state:** `handleVerify` accepts an `asset` query parameter and returns a static JSON response confirming payment cleared. It does not parse C2PA manifests, does not validate signing chains, and does not check any Certificate Authority trust list. The response body says so directly: *"real C2PA manifest parsing pending."*

This is the primary open engineering problem in the protocol.

### Endpoint B: `/stamp` — The Economic Notary (STUB)

**Intended question:** *Did this agent incur a real financial cost to broadcast this data?*

**Current state:** `handleStamp` accepts a `targetHash` field and returns a static JSON response confirming payment cleared. It does not generate a cryptographic attestation, does not sign anything, and does not write to any ledger. It confirms only that payment was received.

### `/health`

Live. Returns gateway status and available endpoints. No payment required.

### `/.well-known/mcp/server-card.json`

Live. Serves an MCP server card describing `verify_provenance` and `notarize_content` as tools, for agent discovery.

---

## The x402 Payment Flow (Live)

```
Agent → GET/POST /verify or /stamp
      ← 402 Payment Required + payment requirements
Agent → pays USDC on Base via x402 facilitator
      → retries with X-PAYMENT header
Worker → builds signed JWT, calls CDP facilitator to verify payment
       → on success, executes endpoint logic (currently stub)
      ← 200 + stub response
```

Payments settle in USDC on Base mainnet. Payment verification is real. Endpoint logic that runs after verification is not yet built out.

---

## WASM Prototype — DISCONNECTED, NOT BUILDABLE

`edge/worker.js` contains an unfinished, more complete implementation of `/verify-provenance`: real payment verify/settle calls, a WASM-based provenance check via `verify_provenance_wasm`, and an actual `repository_dispatch` ledger write. It is **not** the deployed entry point (`wrangler.toml` points to `src/index.js`), it is self-gated off (`IMPLEMENTED.shallow = false`), and it currently cannot build — it imports `../pkg/amora_c2pa.js` and `../pkg/amora_c2pa_bg.wasm`, neither of which exist in this repo.

A separate workflow, `c2pa-spike.yml`, tests whether the official [`c2pa` Rust crate](https://crates.io/crates/c2pa) compiles to `wasm32-unknown-unknown` using a disposable throwaway crate. It does not produce or persist a `pkg/` output — it only tests build feasibility. The spike and the prototype worker have never been connected.

Together these represent real, valuable exploratory work toward the actual C2PA verification build — not something claimed as live, and not something to advertise as near-complete. Treat `edge/worker.js` as a reference implementation for the eventual `/verify` build, not as working code.

---

## GitOps Ledger — SCAFFOLDED, NOT CONNECTED

A GitHub Actions workflow (`ledger-sync.yml`) exists and is capable of receiving `repository_dispatch` events, updating a `data/balances.json` file, committing it, and filing a GitHub Issue on settlement failure. This receiving logic is real and reasonably well built.

**However:** no code in `index.js`, `payments.js`, `notary.js`, or `c2pa.js` currently sends a `repository_dispatch` event. The ledger has never been triggered. `data/balances.json` should be assumed empty or nonexistent until confirmed otherwise.

Wiring `payments.js` to dispatch a ledger event after successful verification is a small, well-scoped next task — not a ground-up build.

---

## Deployment

Managed via GitHub Actions. No CLI required.

```yaml
# .github/workflows/deploy.yml
# Push to main → deployed to Cloudflare's edge
```

**Required secrets:**
- `CF_API_TOKEN` — Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `SETTLEMENT_WALLET` — Base mainnet USDC settlement address
- `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` — Coinbase CDP facilitator credentials
- `GITHUB_LEDGER_TOKEN` — GitHub PAT for ledger dispatch (provisioned, not yet used)

---

## Pricing

Current live pricing is a flat **2000 USDC base units ($0.002)** per call on both `/verify` and `/stamp`, as set in `index.js`. Any tiered pricing (e.g. a "shallow" vs. "deep" verify split) is not implemented in code and should not be advertised until it exists.

---

## Roadmap

### Phase 1 — Partially Live

- ✅ Dual-endpoint router deployed on Cloudflare Workers
- ✅ x402 payment challenge/response loop, verified against CDP facilitator
- ✅ MCP server card live
- 🔲 `/verify` — real C2PA manifest parsing and CA trust chain validation (not yet built)
- 🔲 `/stamp` — real attestation/signing logic (not yet built)
- 🔲 GitOps ledger — wire `payments.js` to fire `repository_dispatch` on settlement

### Phase 2 — Planned (Unbuilt)

- Velocity-based dynamic pricing ("Surge Escalator")
- Note: this is a hypothesis under evaluation, not a committed roadmap item. Cloudflare's own Monetization Gateway now ships compute-based variable pricing; whether a velocity-specific gap remains is unconfirmed.

### Phase 3 — Deferred

- Bonded on-chain escrow staking
- Trust-decay multiplier based on wallet maturity
- Out of scope until Phase 1 is actually complete.

---

## Design Principles

**Separation of concerns.** Media verification and economic friction are different problems. They will share payment infrastructure but nothing else.

**Honest attestation.** Every response should state precisely what was verified and what was not. This README follows the same rule.

**Mobile-manageable.** The entire system — code, deployment, configuration — is managed from a phone via GitHub's mobile interface.

---

## Open Source & Licensing

This repository is open source. The live endpoint is operated by Ande Glenderson. Fork it, deploy your own instance, or contribute to the open engineering problems above.

If you're a systems engineer interested in building the C2PA verification layer or the ledger integration, open an issue or reach out directly.

---

## Built With

- [Cloudflare Workers](https://workers.cloudflare.com/) — V8 isolate edge runtime
- [x402 Protocol](https://x402.org) — HTTP 402 micropayment standard
- [C2PA](https://c2pa.org) — Content Authenticity and Provenance standard (target integration, not yet implemented)
- [Base](https://base.org) — L2 network for USDC settlement
- [Coinbase CDP](https://docs.cdp.coinbase.com/) — x402 payment facilitator

---

*Built and operated from Bahia, Brazil. Managed entirely from a mobile device.*
