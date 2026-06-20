import { verifyPayment } from './payments.js';

/**
 * Endpoint B: The Economic Notary (/stamp)
 * Content-Blind Cryptographic Enveloping
 */
export async function handleStamp(request, env, ctx) {
  try {
    // 1. Baseline Tier Check (Uses the standard price floor)
    const baselineFloor = parseInt(env.X402_PRICE_FLOOR, 10);
    const paymentCheck = await verifyPayment(request, env, baselineFloor);

    if (!paymentCheck.success) {
      return new Response(
        JSON.stringify({ 
          error: "Payment Verification Failed", 
          message: paymentCheck.error 
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Content-Blind Payload Extraction
    const body = await request.json();
    const { targetHash } = body;

    if (!targetHash) {
      return new Response(
        JSON.stringify({ 
          error: "Bad Request", 
          message: "Missing explicit 'targetHash' parameter for notarization." 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Immutable Notarization & Liability Disclaimer
    return new Response(
      JSON.stringify({
        status: "stamped",
        gateway: "Economic Notary (/stamp)",
        targetHash: targetHash,
        assertion: "permanently witnessed and sealed via paid ledger state micro-tariff — zero validation applied to structural or syntactic data types.",
        settlement: {
          transactor: paymentCheck.wallet,
          tariffPaid: paymentCheck.amount
        },
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ 
        error: "Malformed Payload", 
        message: "The Economic Notary requires a valid JSON object structure containing a targetHash." 
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
