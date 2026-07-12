import 'reflect-metadata'; // Required by tsyringe, a dependency of @trustnxt/c2pa-ts. Must load first.
import { handleVerify } from './c2pa.js';
import { handleStamp } from './notary.js';
import { verifyPayment, logLedgerEntry, logSettlementFailure } from './payments.js';
import { testC2paParse } from './test-c2pa.js';

const PAYMENT_HEADER = 'X-PAYMENT';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "X-PAYMENT, Content-Type"
};

const SERVER_CARD = {
  "$schema": "https://schemas.modelcontextprotocol.io/server-card/v1.json",
  "version": "1.0.0",
  "protocolVersion": "2025-11-25",
  "serverInfo": {
    "name": "amora-protocol",
    "title": "Amora Protocol",
    "description": "x402-gated C2PA content provenance verification and content notarization. Agents pay per-call in USDC on Base Mainnet to access verification tools.",
    "homepage": "https://github.com/andeglenderson/amora-protocol"
  },
  "transport": {
    "type": "streamable-http",
    "url": "https://x402-dual-gateway.andeglenderson.workers.dev"
  },
  "capabilities": {
    "tools": true,
    "resources": false,
    "prompts": false
  },
  "tools": [
    {
      "name": "verify_provenance",
      "description": "Verify C2PA content provenance manifest for a media asset. Requires x402 payment of 2000 USDC base units per call.",
      "endpoint": "/verify",
      "method": "GET"
    },
    {
      "name": "notarize_content",
      "description": "Generate timestamped cryptographic attestation for arbitrary content without inspecting it. Requires x402 payment of 2000 USDC base units per call.",
      "endpoint": "/stamp",
      "method": "POST"
    }
  ]
};

const LLMS_TXT_CONTENT = `# Amora Protocol

> Amora is an x402 micropayment-gated API for verifying digital content
> provenance. It checks C2PA manifest signatures and content hash
> integrity on images for a small per-call fee in USDC on Base mainnet.
> Built and operated entirely from a mobile device, open source, honest
> about its current limitations (no external trust-list checking yet).

## Core

- [FAQ](./faq.md): Direct answers to common questions about what
  Amora checks, what it costs, what it doesn't do yet, and how to
  call it.
- [README](./README.md): Full architecture, current implementation
  status, and roadmap.
- [MCP Server Card](./.well-known/mcp/server-card.json): Structured
  tool description for AI agent frameworks.

## Optional

- [GitHub Repository](https://github.com/andeglenderson/amora-protocol):
  Full source code.`;

const AI_CATALOG_JSON_CONTENT = {
  "specVersion": "1.0",
  "host": {
    "displayName": "Amora Protocol",
    "identifier": "x402-dual-gateway.andeglenderson.workers.dev"
  },
  "entries": [
    {
      "identifier": "urn:ai:x402-dual-gateway.andeglenderson.workers.dev:tools:verify",
      "displayName": "Amora Content Provenance Verifier",
      "type": "application/mcp-server+json",
      "url": "https://x402-dual-gateway.andeglenderson.workers.dev/.well-known/mcp/server-card.json",
      "description": "Verifies C2PA manifest signature integrity and content hash consistency on images, gated by a small x402 USDC micropayment on Base mainnet. Does not yet check signing certificates against an external trust list, and does not detect Exclusion Range metadata manipulation.",
      "representativeQueries": [
        "verify if this image has been altered since it was signed",
        "check the C2PA provenance of this photo",
        "is this image's content authenticity manifest valid"
      ]
    }
  ]
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

    // --- TEST ROUTE — throwaway, no payment required ---
    if (url.pathname === "/test-c2pa") {
      return await testC2paParse();
    }

    // --- llms.txt — machine-readable index ---
    if (url.pathname === "/llms.txt") {
      return new Response(LLMS_TXT_CONTENT, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...CORS_HEADERS
        }
      });
    }

    // --- ARD ai-catalog.json — agent discovery ---
    if (url.pathname === "/ai-catalog.json" || url.pathname === "/.well-known/ai-catalog.json") {
      return new Response(JSON.stringify(AI_CATALOG_JSON_CONTENT, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...CORS_HEADERS
        }
      });
    }

    if (url.pathname === "/.well-known/mcp/server-card.json") {
      return new Response(JSON.stringify(SERVER_CARD), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
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

    if (url.pathname === "/verify" || url.pathname === "/stamp") {

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

      let assetRef = null;

      if (url.pathname === "/verify") {
        assetRef = url.searchParams.get("asset");
      } else if (url.pathname === "/stamp") {
        try {
          const clonedRequest = request.clone();
          const body = await clonedRequest.json();
          assetRef = body.targetHash ?? null;
        } catch {
          assetRef = null;
        }
      }

      const tier = url.pathname === "/verify" ? "verify" : "stamp";

      if (!verification.valid) {
        ctx.waitUntil(
          logSettlementFailure({ tier, assetRef, error: verification.error }, env)
        );

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

      ctx.waitUntil(
        logLedgerEntry({ tier, assetRef, amount: "2000" }, env)
      );

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
