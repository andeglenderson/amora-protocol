/**
 * Helper to generate a CDP-compliant JWT for Ed25519 keys
 */
async function generateCDPToken(env) {
  const keyId = env.CDP_API_KEY_ID;
  const secretBase64 = env.CDP_API_KEY_SECRET;

  // 1. Prepare Header and Payload
  const header = { alg: "EdDSA", typ: "JWT", kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: keyId,
    aud: "cdp_api",
    iat: now,
    exp: now + 120, // 2-minute expiration
    uri: "POST /platform/v2/x402/verify" // Must match request context
  };

  const encodeBase64Url = (obj) => 
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(payload);
  const message = `${encodedHeader}.${encodedPayload}`;

  // 2. Sign using Web Crypto API
  // Decodes your base64 secret into the 32-byte seed required for Ed25519
  const rawKey = Uint8Array.from(atob(secretBase64), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey.slice(0, 32), 
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("Ed25519", cryptoKey, new TextEncoder().encode(message));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${message}.${encodedSignature}`;
}

export async function verifyPayment(paymentHeader, paymentRequired, env) {
  const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402/verify";

  try {
    const token = await generateCDPToken(env);

    // Reconstruct your payload structure here
    const body = {
      x402Version: 2,
      paymentPayload: { /* ... existing payload logic ... */ },
      paymentRequirements: paymentRequired
    };

    const response = await fetch(FACILITATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      return { valid: false, error: `Facilitator error: ${response.status} ${err}` };
    }

    const result = await response.json();
    return { valid: result.isValid === true, payer: result.payer ?? null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
