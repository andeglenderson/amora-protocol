const FACILITATOR_URL = "https://x402.org/facilitator/verify";

export async function verifyPayment(paymentHeader, paymentRequired, env) {
  try {
    let paymentPayload;
    try {
      paymentPayload = JSON.parse(atob(paymentHeader));
    } catch {
      return { valid: false, error: "Malformed payment header" };
    }

    const body = {
      x402Version: 2,
      paymentPayload: {
        x402Version: 2,
        accepted: {
          scheme: paymentRequired.scheme,
          network: paymentRequired.network,
          asset: paymentRequired.asset,
          amount: paymentRequired.amount,
          payTo: paymentRequired.payTo,
          maxTimeoutSeconds: paymentRequired.maxTimeoutSeconds,
          extra: paymentRequired.extra
        },
        payload: paymentPayload.payload ?? paymentPayload
      },
      paymentRequired: {
        scheme: paymentRequired.scheme,
        network: paymentRequired.network,
        asset: paymentRequired.asset,
        amount: paymentRequired.amount,
        payTo: paymentRequired.payTo,
        maxTimeoutSeconds: paymentRequired.maxTimeoutSeconds,
        extra: paymentRequired.extra
      }
    };

    const response = await fetch(FACILITATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      return { valid: false, error: `Facilitator error: ${response.status} ${err}` };
    }

    const result = await response.json();
    return {
      valid: result.isValid === true,
      payer: result.payer ?? null,
      error: result.invalidReason ?? null
    };

  } catch (err) {
    return { valid: false, error: err.message };
  }
}
