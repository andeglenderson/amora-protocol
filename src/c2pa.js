export async function handleVerify(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const assetUrl = url.searchParams.get('asset');

    if (!assetUrl) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Missing required query parameter: asset"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "verified",
        gateway: "Trust Oracle (/verify)",
        asset: assetUrl,
        assertion: "IMPLEMENTED flag active — real C2PA manifest parsing pending.",
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal Error",
        message: err.message
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
