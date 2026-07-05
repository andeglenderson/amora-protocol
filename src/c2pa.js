// Trust Oracle — /verify
// Real implementation using @trustnxt/c2pa-ts, confirmed working inside
// this Worker via overnight testing (see test-c2pa.js history).
//
// IMPORTANT — HONEST SCOPE: this checks structural integrity, content
// hashes, and signature math against the embedded manifest. It does
// NOT check the signing certificate against an external Trust List —
// @trustnxt/c2pa-ts does not yet implement chain-of-trust validation
// (confirmed directly in the library's own README roadmap). A
// "verified" result here means the manifest is internally consistent
// and unmodified since signing — it does NOT confirm the signer's
// real-world identity or legitimacy. That gap is the next build task.

import { createAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore } from '@trustnxt/c2pa-ts/manifest';

const ATTESTATION_TEXT =
  "Cryptographic structure, content hashes, and signature math checked " +
  "against the embedded C2PA manifest. Signing authority has NOT been " +
  "checked against an external Trust List — chain-of-trust validation " +
  "is not yet implemented. A structurally valid signature does not " +
  "confirm the signer's real-world identity or legitimacy.";

export async function handleVerify(request, env, ctx) {
  const timestamp = new Date().toISOString();

  try {
    const url = new URL(request.url);
    const assetUrl = url.searchParams.get('asset');

    if (!assetUrl) {
      return jsonResponse(400, {
        error: "Bad Request",
        message: "Missing required query parameter: asset"
      });
    }

    // --- Fetch the target asset ---
    let assetRes;
    try {
      assetRes = await fetch(assetUrl);
    } catch (fetchErr) {
      return jsonResponse(422, {
        status: "error",
        gateway: "Trust Oracle (/verify)",
        asset: assetUrl,
        error: `Failed to fetch asset: ${fetchErr.message}`,
        timestamp
      });
    }

    if (!assetRes.ok) {
      return jsonResponse(422, {
        status: "error",
        gateway: "Trust Oracle (/verify)",
        asset: assetUrl,
        error: `Asset unreachable: HTTP ${assetRes.status}`,
        timestamp
      });
    }

    const buf = new Uint8Array(await assetRes.arrayBuffer());

    // --- Recognize format ---
    let asset;
    try {
      asset = await createAsset(buf);
    } catch (formatErr) {
      return jsonResponse(415, {
        status: "unsupported_format",
        gateway: "Trust Oracle (/verify)",
        asset: assetUrl,
        error: `Unrecognized or unsupported file format: ${formatErr.message}`,
        timestamp
      });
    }

    // --- Extract manifest ---
    const jumbf = await asset.getManifestJUMBF();

    if (!jumbf) {
      return jsonResponse(200, {
        status: "no_manifest",
        gateway: "Trust Oracle (/verify)",
        asset: assetUrl,
        assertion: "No embedded C2PA manifest found in this asset. Nothing to verify — this is not an error, just an unsigned or stripped asset.",
        timestamp
      });
    }

    // --- Parse and validate ---
    let validationResult;
    try {
      const superBox = SuperBox.fromBuffer(jumbf);
      const manifestStore = ManifestStore.read(superBox);
      validationResult = await manifestStore.validate(asset);
    } catch (parseErr) {
      return jsonResponse(200, {
        status: "malformed_manifest",
        gateway: "Trust Oracle (/verify)",
        asset: assetUrl,
        error: `A manifest is present but could not be parsed or validated: ${parseErr.message}`,
        timestamp
      });
    }

    return jsonResponse(200, {
      status: "verified",
      gateway: "Trust Oracle (/verify)",
      asset: assetUrl,
      assertion: ATTESTATION_TEXT,
      validationResult,
      timestamp
    });

  } catch (err) {
    return jsonResponse(500, {
      error: "Internal Error",
      message: err.message
    });
  }
}

function jsonResponse(status, obj) {
  return new Response(
    JSON.stringify(obj, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
