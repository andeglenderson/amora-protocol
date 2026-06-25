const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402/verify";
const FACILITATOR_HOST = "api.cdp.coinbase.com";
const FACILITATOR_PATH = "/platform/v2/x402/verify";

function b64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateBearerToken(apiKeyId, apiKeySecret) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "EdDSA",
    typ: "JWT",
    kid: apiKeyId,
    nonce: randomHex(16)
  };

  const payload = {
    iss: "cdp",
    sub: apiKeyId,
    aud: ["cdp_service"],
    nbf: now,
    exp: now + 120,
    uri: `POST ${FACILITATOR_HOST}${FACILITATOR_PATH}`
  };

  const headerB64 = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyBytes = Uint8Array.from(atob(apiKeySecret), (c) => c.charCodeAt(0));
  const seedOnly = keyBytes.slice(0, 32);

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

    // x402Version 2 structure
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
