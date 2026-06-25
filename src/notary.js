export async function handleStamp(request, env, ctx) {
  try {
    const body = await request.json();
    const { targetHash } = body;

    if (!targetHash) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Missing required field: targetHash"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "stamped",
        gateway: "Economic Notary (/stamp)",
        targetHash: targetHash,
        assertion: "Financial cost incurred at submission time. Content-blind — no validation applied to payload structure or data types.",
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Malformed Payload",
        message: "The Economic Notary requires a valid JSON object containing a targetHash field."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
