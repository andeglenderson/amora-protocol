// edge/worker.js
import init, { verify_provenance_wasm } from '../pkg/amora_c2pa.js';
import wasmModule from '../pkg/amora_c2pa_bg.wasm';

// --- SYSTEM CONSTANTS & CONFIGURATION ---
const IMPLEMENTED = {
  shallow: false, // CRITICAL: Kept false until code review and PR merge are verified
  deep: false,
  batch: false
};

const USDC_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Standard Base USDC
const FACILITATOR_URL = "https://x402.org/facilitator";
const NETWORK = "base-mainnet";

// FIX 1: USDC base units (6 decimals) and tightened replay attack timeouts
const PRICE_TABLE = {
  shallow: { amount: "2000", timeout: 30 },
  deep: { amount: "15000", timeout: 45 },
  batch: { amount: "60000", timeout: 60 }
};

let wasmInitialized = false;

async function initializeWasmContext() {
  if (!wasmInitialized) {
    await init(wasmModule);
    wasmInitialized = true;
  }
}

// FIX 2: Dynamically bind the settlement wallet via environment secrets
const getPaymentRequirements = (url, env) => ({
  scheme: 'exact',
  network: NETWORK,
  asset: USDC_ASSET,
  payTo: env.SETTLEMENT_WALLET, 
  maxAmountRequired: PRICE_TABLE.shallow.amount,
  maxTimeoutSeconds: PRICE_TABLE.shallow.timeout,
  resource: url.toString()
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname !== '/verify-provenance') {
      return new Response("Not Found", { status: 404 });
    }

    // --- PHASE 1: Verification Tier Gate (Absolute Top) ---
    if (!IMPLEMENTED.shallow) {
      return new Response(JSON.stringify({
        error: "Not Implemented",
        message: "Shallow validation tier code is staged but not flipped to active status."
      }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const assetUrl = url.searchParams.get('asset');
    
    // x402 Standard Header
    const paymentHeader = request.headers.get('X-PAYMENT');
    const requirements = getPaymentRequirements(url, env);

    // --- PHASE 2: x402 Payment Loop Challenge ---
    if (!paymentHeader) {
      return new Response(JSON.stringify({
        x402Version: 1,
        accepts: [requirements]
      }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // --- PHASE 3: Authentic Facilitator Payment Verification ---
      const isPaymentValid = await verifyPaymentWithFacilitator(paymentHeader, requirements);
      if (!isPaymentValid) {
        return new Response(JSON.stringify({ error: "Invalid or unverified payment proof." }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // --- PHASE 4: Execution & Instantiation ---
      await initializeWasmContext();
      const verificationResponse = await runProvenanceCheck(assetUrl);

      // --- PHASE 5: Real Asynchronous Settle & Ledger Write ---
      ctx.waitUntil(settleTransactionAndLog(paymentHeader, requirements, assetUrl, env));

      return verificationResponse;

    } catch (err) {
      return new Response(JSON.stringify({ error: `Gateway routing failure: ${err.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Handles asset streaming and calls the native Rust WASM validation module.
 */
async function runProvenanceCheck(assetUrl) {
  if (!assetUrl) {
    return new Response(JSON.stringify({ error: "Missing required 'asset' query parameter." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const assetResponse = await fetch(assetUrl, {
    headers: { "User-Agent": "Amora-Provenance-Gateway/1.0" }
  });

  if (!assetResponse.ok) {
    return new Response(JSON.stringify({
      verified: false,
      error: `Asset unreachable. Status: ${assetResponse.status}`
    }), { status: 422, headers: { "Content-Type": "application/json" } });
  }

  const mimeType = assetResponse.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await assetResponse.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const wasmOutputRaw = verify_provenance_wasm(uint8Array, mimeType);
  const parsedResult = JSON.parse(wasmOutputRaw);

  return new Response(JSON.stringify({
    verified: parsedResult.verified,
    signer: parsedResult.signer || null,
    timestamp: parsedResult.timestamp || null,
    tier: "shallow",
    error: parsedResult.error || null,
    processed_at: new Date().toISOString()
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Spec-compliant x402 verification request.
 */
async function verifyPaymentWithFacilitator(proof, requirements) {
  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Amora-Gateway-Isolate"
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: JSON.parse(atob(proof)),
        paymentRequirements: requirements
      })
    });

    if (!response.ok) return false;
    const outcome = await response.json();
    return outcome.valid === true;
  } catch (e) {
    return false;
  }
}

/**
 * Facilitator fund settlement combined with GitOps ledger logging.
 */
async function settleTransactionAndLog(proof, requirements, assetUrl, env) {
  try {
    const payload = JSON.parse(atob(proof));

    // 1. Execute the actual movement of funds
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Amora-Gateway-Isolate"
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: payload,
        paymentRequirements: requirements
      })
    });

    if (!settleResponse.ok) {
      console.error("Fund settlement failed, aborting ledger write.");
      return; 
    }

    // 2. Issue the GitOps ledger write
    await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dispatches`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${env.GITHUB_LEDGER_TOKEN}`,
        "User-Agent": "Amora-Gateway-Isolate",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        event_type: "x402_settlement_event",
        client_payload: {
          proof: proof,
          asset_url: assetUrl,
          execution_timestamp: new Date().toISOString()
        }
      })
    });
  } catch (logError) {
    console.error("Ledger settlement process failed: ", logError.message);
  }
                                            }
      
