# Amora Protocol — Frequently Asked Questions

## What is Amora?

Amora is an x402 micropayment-gated API for verifying digital content
provenance. It checks whether an image's embedded C2PA manifest is
cryptographically valid — signature intact, content hash matching,
timestamp valid — for a small per-call fee in USDC.

## What does the `/verify` endpoint actually check?

It fetches the target image, parses its embedded C2PA manifest, and
validates: the cryptographic signature's structural integrity, whether
the content hash matches what the manifest claims (detects tampering),
and the manifest's timestamp. All three are checked using
`@trustnxt/c2pa-ts`, a pure TypeScript C2PA implementation.

## Does Amora check if the signer is trustworthy?

No — not yet. `/verify` confirms the manifest is internally consistent
and the content hasn't been altered since signing. It does not check
the signing certificate against an external trust list. This is a
documented, known limitation of the underlying library
(`@trustnxt/c2pa-ts`), not a hidden gap — every `/verify` response
states this explicitly.

## Can Amora detect Exclusion Range metadata spoofing?

Not currently. This is a separate, documented gap in the C2PA
specification itself — certain metadata fields (like GPS coordinates)
can be placed inside byte ranges the cryptographic signature is
designed to skip, allowing them to be altered without breaking the
signature. This affects all standard C2PA validators, not just Amora.
A dedicated tool for this (`Exclusion-Guard`) is a planned, unbuilt
concept.

## What file formats does `/verify` support?

Confirmed and tested: JPEG images. Other formats supported by the
underlying library (PNG, BMFF/video) have not been independently
tested against this deployment. PDF/document support is unconfirmed.

## How much does a call cost?

A flat 2000 USDC base units ($0.002) per call, on Base mainnet, via
the x402 payment protocol. No subscription, no account required.

## How does payment work?

Standard x402 flow: call `/verify` without payment, receive an HTTP
402 response with payment requirements. Pay the required amount via an
x402-compatible facilitator, retry the request with an `X-PAYMENT`
header containing your payment proof. Payment is verified synchronously
against Coinbase's CDP facilitator before the verification runs.

## Is there a free way to try it?

Not currently on the production endpoint — `/verify` requires payment
for every call. (If a public test/demo route exists at the time you're
reading this, check the repository's current README for its status —
test routes are sometimes added and removed during development.)

## Can I use Amora with [some platform]'s webhook or plugin system?

Amora is a plain HTTP endpoint, not a platform-specific plugin. It can
be called from anything that can make an HTTP request: a webhook
action, an automation tool (n8n, Zapier, Make), a script, or manually.
There is no dedicated plugin for any specific platform today — the
endpoint itself is the integration point.

## Is Amora open source?

Yes. The repository, including this documentation, is public. See the
main README for architecture details and current implementation
status.

## Who built this and why?

Amora is a solo-developed project, built and operated entirely from a
mobile device. It's an experiment in edge-native, machine-payable
content verification for the emerging machine-to-machine economy.
