const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402/verify";

async function generateCdpJwt(keyId, keySecret) {
  const now = Math.floor(Date.now() / 1000);
  const uri = "POST api.cdp.coinbase.com/platform/v2/x402/verify";

  const header = {
    alg: "EdDSA",
    kid: keyId,
    nonce: crypto.randomUUID().replace(/-/g, "")
  };

  const payload = {
    iss: "cdp",
    sub: keyId,
    nbf: now,
    exp: now + 120,
    uri: uri
  };

  const encode = (obj) => {
    const json = JSON.stringify(obj);
    return btoa(json).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyBytes = Uint8Array.from(atob(keySecret), c => c.charCodeAt(0));
  const seed = keyBytes.slice(0, 32);

  const pkcs8 = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    ...seed
  ]);

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const messageBytes = new TextEncoder().encode(signingInput);
  const signatureBytes = await crypto.subtle.sign("Ed25519", cryptoKey, messageBytes);

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

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
      paymentRequirements: {
        scheme: paymentRequired.scheme,
        network: paymentRequired.network,
        asset: paymentRequired.asset,
        amount: paymentRequired.amount,
        payTo: paymentRequired.payTo,
        maxTimeoutSeconds: paymentRequired.maxTimeoutSeconds,
        extra: paymentRequired.extra
      }
    };

    const jwt = await generateCdpJwt(
      env.CDP_API_KEY_ID ?? "a5a77625-81cf-4187-a610-7df6b11d41ab",
      env.CDP_API_KEY_SECRET ?? "hOc47FCq9us+9W20xom1zXBjQ0y7V2HNTtMahwQBgVByNMdcHt8DNXa4FmbIDFu/b4uY4hAL9VppEEgGAopdVw=="
    );

    const response = await fetch(FACILITATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`
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
