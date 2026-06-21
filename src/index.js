import { handleVerify } from './c2pa.js';
import { handleStamp } from './notary.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

    if (url.pathname === "/verify") {
      return await handleVerify(request, env, ctx);
    }

    if (url.pathname === "/stamp" && request.method === "POST") {
      return await handleStamp(request, env, ctx);
    }

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
