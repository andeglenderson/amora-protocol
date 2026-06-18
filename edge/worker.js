/**
 * C2PA Provenance Verification — x402 Resource Server
 * Cloudflare Worker
 *
 * Safety rule: Any tier marked false in IMPLEMENTED short-circuits to a 501
 * BEFORE payment challenges are built or headers are parsed.
 */

const FACILITATOR_URL = "https://x402.org/facilitator"; 
const NETWORK = "base";
const USDC_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; 

const PRICE_TABLE = {
  shallow: { amount: "2000",  timeout: 30 },  // $0.002
  deep:    { amount: "15000", timeout: 45 },  // $0.015
  batch:   { amount: "60000", timeout: 60 },  // $0.06
};

// 🛑 THE MASTER SAFETY SWITCHES
// Only flip a tier to true in the same commit that wires in real validation logic.
const IMPLEMENTED = {
  shallow: false,
  deep:    false,
  batch:   false,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const tier = url.pathname.endsWith("/verify-provenance/deep") ? "deep" :
                 url.pathname.endsWith("/verify-provenance/batch") ? "batch" :
                 url.pathname.endsWith("/verify-provenance") ? "shallow" : null;

    if (!tier) {
      return json({ error: "unknown resource" }, 404);
    }

    // --- Hard stop before anything payment-related happens ---
    if (!IMPLEMENTED[tier]) {
      return json({
        error: "not_implemented",
        detail: `Provenance verification for tier [${tier}] is not yet active. ` +
                `No payment is required, accepted, or possible for this resource.`,
      }, 501);
    }

    const assetRef = url.searchParams.get("asset"); 
    if (!assetRef && tier !== "batch") {
      return json({ error: "missing 'asset' param" }, 400);
    }

    const paymentHeader = request.headers.get("X-PAYMENT");
    const requirements = {
      scheme: "exact",
      network: NETWORK,
      asset: USDC_ASSET,
      payTo: "YOUR_SETTLEMENT_WALLET_ADDRESS",
      maxAmountRequired: PRICE_TABLE[tier].amount,
      maxTimeoutSeconds: PRICE_TABLE[tier].timeout,
      resource: url.toString(),
    };

    if (!paymentHeader) {
      return json({ x402Version: 1, accepts: [requirements] }, 402);
    }

    // --- Verify payment with facilitator ---
    let verifyResult;
    try {
      verifyResult = await callFacilitator("/verify", {
        x402Version: 1,
        paymentPayload: JSON.parse(atob(paymentHeader)),
        paymentRequirements: requirements,
      });
    } catch (err) {
      return json({ error: "facilitator unreachable", detail: String(err) }, 502);
    }

    if (!verifyResult.isValid) {
      return json({ x402Version: 1, accepts: [requirements], error: verifyResult.invalidReason }, 402);
    }

    // Unreachable fallback safety net
    return json({
      error: "not_implemented",
      detail: `Verified payment, but provenance logic for [${tier}] is still pending.`,
    }, 501);
  },
};

async function callFacilitator(path, body) {
  const res = await fetch(FACILITATOR_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`facilitator ${path} failed`);
  return res.json();
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
  }
