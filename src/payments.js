const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402/verify";

function b64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateBearerToken(apiKeyId, apiKeySecret) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "EdDSA", kid: apiKeyId };
  const payload = {
    iss: apiKeyId,
    sub: apiKeyId,
    nbf: now,
    exp: now + 120,
    aud: ["cdp_service"]
  };

  const headerB64 = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyBytes = Uint8Array.from(atob(apiKeySecret), (c) => c.charCodeAt(0));

  // Extract private seed — first 32 bytes of the 64-byte keypair
  const seedOnly = keyBytes.slice(0, 32);

  // PKCS8 ASN.1 wrapper for 32-byte Ed25519 private seed
  const pkcs8Header = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
  ]);

  const pkcs8Bytes = new Uint8Array(pkcs8Header.length + seedOnly.length);
  pkcs8Bytes.set(pkcs8Header);
  pkcs8Bytes.set(seedOnly, pkcs8Header.length);

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Bytes,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "Ed25519",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${b64url(signature)}`;
}

export async function verifyPayment(paymentHeader, paymentRequired, env) {
  try {
    const bearer = await generateBearerToken(
      env.CDP_API_KEY_ID,
      env.CDP_API_KEY_SECRET
    );

    let paymentPayload;
    try {
      paymentPayload = JSON.parse(atob(paymentHeader));
    } catch {
      return { valid: false, error: "Malformed payment header" };
    }

    const body = {
      x402Version: 1,
      paymentPayload,
      paymentRequired
    };

    const response = await fetch(FACILITATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearer}`
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
