import { handleVerify } from './c2pa.js';
import { handleStamp } from './notary.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Global Health / Uptime Check
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(
        JSON.stringify({ 
          status: "healthy", 
          runtime: "v8-edge-isolate",
          gateways: ["/verify", "/stamp"]
        }), 
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // 2. Route to Endpoint A: The Trust Oracle (Content-Aware)
    if (url.pathname === "/verify" && request.method === "POST") {
      return await handleVerify(request, env, ctx);
    }

    // 3. Route to Endpoint B: The Economic Notary (Content-Blind)
    if (url.pathname === "/stamp" && request.method === "POST") {
      return await handleStamp(request, env, ctx);
    }

    // 4. Catch-All Routing Failure
    return new Response(
      JSON.stringify({ 
        error: "Not Found", 
        message: "Resource does not exist or method is invalid." 
      }), 
      {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
