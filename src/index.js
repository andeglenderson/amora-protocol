import { handleVerify } from './c2pa.js';
import { handleStamp } from './notary.js';
import { verifyPayment } from './payments.js';

const PAYMENT_HEADER = 'X-PAYMENT';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "X-PAYMENT, Content-Type"
};

function payment402Response(developerWallet) {
  return new Response(
    JSON.stringify({
      x402Version: 2,
      error: "Payment Required",
      accepts: [{
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        currency: "USDC",
        amount: "2000",
        payTo: developerWallet,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" }
      }]
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    }
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          runtime: "v8-edge-isolate",
          gateways: ["/verify", "/stamp"],
          network: "Base Mainnet"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        }
      );
    }

    if (url.pathname === "/openapi.json") {
      const res = await fetch(
        "https://raw.githubusercontent.com/andeglenderson/amora-protocol/main/openapi.json"
      );
      const spec = await res.text();
      return new Response(spec, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }

    if (url.pathname === "/verify" ||
        (url.pathname === "/stamp" && request.method === "POST")) {

      const paymentHeader = request.headers.get(PAYMENT_HEADER);
      const developerWallet = env.SETTLEMENT_WALLET ?? "0x0000000000000000000000000000000000000000";

      if (!paymentHeader || paymentHeader.trim() === "") {
        return payment402Response(developerWallet);
      }

      const paymentRequired = {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "2000",
        payTo: developerWallet,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" }
      };

      const verification = await verifyPayment(paymentHeader, paymentRequired, env);

      if (!verification.valid) {
        return new Response(
          JSON.stringify({
            error: "Payment verification failed",
            reason: verification.error
          }),
          {
            status: 402,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS
            }
          }
        );
      }

      if (url.pathname === "/verify") {
        return await handleVerify(request, env, ctx);
      }

      return await handleStamp(request, env, ctx);
    }

    return new Response(
      JSON.stringify({
        error: "Not Found",
        message: "Resource does not exist or method is invalid."
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      }
    );
  }
};
