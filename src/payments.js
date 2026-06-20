/**
 * Shared x402 Micropayment Validation Utilities
 */

export async function verifyPayment(request, env, requiredPriceFloor) {
  // 1. Extract the x402 payment header
  const paymentHeader = request.headers.get("X-x402-Payment");
  
  if (!paymentHeader) {
    throw new Error("Missing X-x402-Payment invoice settlement header.");
  }

  try {
    // Expected header format: wallet=0x...; amount=2000; sig=0x...
    const params = Object.fromEntries(
      paymentHeader.split(';').map(item => item.trim().split('='))
    );

    const amount = parseInt(params.amount, 10);
    const wallet = params.wallet;
    const signature = params.sig;

    if (!amount || !wallet || !signature) {
      throw new Error("Malformed payment metadata parameters.");
    }

    // 2. Enforce the economic floor
    if (amount < requiredPriceFloor) {
      throw new Error(`Insufficient micro-tariff. Required: ${requiredPriceFloor} base units.`);
    }

    // Return parsed details for the downstream notary envelopes
    return {
      success: true,
      amount,
      wallet,
      signature
    };
    
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
