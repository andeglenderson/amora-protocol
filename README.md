# Amora Protocol — x402 Dual-Gateway

A GitOps-native, stateless micro-billing framework for the machine economy. Two endpoints. Zero servers. Deployable from a phone.

**Live endpoint:** `https://x402-dual-gateway.andeglenderson.workers.dev`

---

## What This Is

The internet's traffic is now majority machine-generated. Autonomous AI agents browse, query, and transact without human involvement — and they need infrastructure built for them, not for browsers.

The Amora Protocol is a lightweight, open-source billing gateway that sits at the intersection of two problems:

1. **Media trust** — is this asset what it claims to be, and who vouched for it?
2. **Economic friction** — did this agent incur a real financial cost to broadcast this data?

Both problems are solved at the edge, in milliseconds, via micropayments. No databases. No identity records. No servers to manage.

---

## Architecture

The gateway runs as a single Cloudflare Worker with two distinct endpoints sharing one x402 payment infrastructure.

```
src/
├── index.js        # Global request router
├── payments.js     # Shared x402 payment verification logic
├── c2pa.js         # Trust Oracle — content-aware validation
└── notary.js       # Economic Notary — content-blind stamping
```

### Endpoint A: `/verify` — The Trust Oracle

**Question it answers:** *Is this piece of media cryptographically valid, and who signed it?*

- Content-aware: parses C2PA manifests and validates signing chains against Certificate Authority trust lists
- Returns structured verification result: signer identity, timestamp, validation status
- Liability profile: makes explicit cryptographic assertions about signature validity at query time — not about real-world truth or content accuracy
- Pricing: premium micro-tariff reflecting computational overhead

**Attestation language:** *"This signature is cryptographically valid according to the designated C2PA trust roots at this exact point in time. No assertion is made regarding the real-world authenticity, truthfulness, or accuracy of the underlying media content."*

### Endpoint B: `/stamp` — The Economic Notary

**Question it answers:** *Did this agent incur a real financial cost to broadcast this data?*

- Content-blind: does not read, parse, or judge the payload
- Accepts any JSON object, confirms x402 payment, returns a signed economic envelope
- Liability profile: zero — no content claims made
- Pricing: volume micro-tariff designed as a universal M2M filter

**Attestation language:** *"This payload was witnessed and sealed via paid ledger state micro-tariff. Content accuracy and node identity remain unexamined."*

### `/health`

Returns gateway status and available endpoints. No payment required.

---

## The x402 Payment Flow

```
Agent → POST /verify or /stamp
      ← 402 Payment Required + payment requirements
Agent → pays USDC on Base via x402 facilitator
      → retries with X-PAYMENT header
Worker → verifies payment with facilitator
       → executes endpoint logic
       → settles payment
       → writes to GitOps ledger
      ← 200 + verified result or stamped envelope
```

Payments are settled in USDC on Base mainnet. The x402 protocol is an open standard — any compliant agent SDK can interact with this gateway without integration work.

---

## GitOps Ledger

Every settlement triggers a `repository_dispatch` event to this repository, writing the transaction to a version-controlled audit ledger. The ledger is public, append-only, and requires no external database.

This means every payment this gateway has ever processed is visible in the repository's commit and Issues history.

---

## Deployment

The entire gateway is managed via GitHub Actions. No CLI required. No server to provision.

```yaml
# .github/workflows/deploy.yml
# Push to main → deployed to Cloudflare's global edge in ~25 seconds
```

**Required secrets:**
- `CF_API_TOKEN` — Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `SETTLEMENT_WALLET` — Base mainnet USDC settlement address
- `GITHUB_LEDGER_TOKEN` — GitHub PAT for ledger dispatch

**wrangler.toml variables:**
- `X402_PRICE_FLOOR` — base price in USDC units (2000 = $0.002)
- `ENVIRONMENT` — deployment environment

---

## Price Table

| Endpoint | Amount | USDC Base Units |
|---|---|---|
| `/verify` shallow | $0.002 | 2000 |
| `/verify` deep | $0.015 | 15000 |
| `/stamp` | $0.002 | 2000 |

All amounts in USDC on Base mainnet. USDC uses 6 decimal places — values are expressed in base units.

---

## Roadmap

### Phase 1 — Live ✓
- Dual-endpoint gateway deployed on Cloudflare Workers
- x402 payment loop with facilitator verify and settle
- GitOps ledger via repository_dispatch
- Branch-protected deploy pipeline

### Phase 2 — Surge Escalator
- Cloudflare Cache API velocity tracking per wallet
- Exponential price scaling on burst detection (10x, 100x)
- Probabilistic deterrent against high-volume coordinated requests
- Note: Cache API consistency is regional, not globally guaranteed — this functions as a strong deterrent, not an absolute rate limit

### Phase 3 — Deferred
- Bonded on-chain escrow staking
- Trust-decay multiplier based on wallet maturity
- These phases are intentionally out of scope until Phase 2 is validated in production

---

## Design Principles

**Separation of concerns.** Media verification and economic friction are different problems. They share payment infrastructure but nothing else.

**Honest attestation.** Every response states precisely what was verified and what was not. No overclaiming. The system is a cryptographic validator, not a content judge.

**Zero operational overhead.** No customer support. No identity records. No compliance surface beyond what the x402 standard requires. If payment clears, the endpoint responds.

**Mobile-manageable.** The entire system — code, deployment, ledger, configuration — is managed from a phone via GitHub's mobile interface. This is a deliberate constraint that produces genuinely minimal architecture.

---

## Open Source & Licensing

This repository is open source. The architecture is the contribution.

The live endpoint at `x402-dual-gateway.andeglenderson.workers.dev` is operated by Ande Glenderson. Fork the repo, deploy your own instance, or build on top of the framework.

If you're building agent infrastructure and want to discuss integration or partnership, open an issue or reach out directly.

---

## Built With

- [Cloudflare Workers](https://workers.cloudflare.com/) — V8 isolate edge runtime
- [x402 Protocol](https://x402.org) — HTTP 402 micropayment standard
- [C2PA](https://c2pa.org) — Content Authenticity and Provenance standard
- [Base](https://base.org) — L2 network for USDC settlement
- GitHub Actions + GitHub Pages — GitOps ledger and deployment

---

*Built and operated from Bahia, Brazil. Managed entirely from a mobile device.*
