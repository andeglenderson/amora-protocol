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
//
// SEN ADDITION (this change) — HONEST SCOPE: this adds a best-effort
// extraction of SEN's custom C2PA assertions (sen.network.telemetry,
// sen.network.pricing, sen.network.semantics) when present, so /verify
// can surface them alongside the standard validation result. It does
// NOT yet do anything with them — no pricing enforcement, no telemetry
// checks, no escrow interaction. It's read-only surfacing, nothing more.
//
// UNCONFIRMED — VERIFY BEFORE MERGING: extractSenAssertions() below
// guesses at how to enumerate assertions on the parsed manifest object
// (manifestStore.manifests / manifest.assertions). I could not confirm
// the exact property/method names against @trustnxt/c2pa-ts's actual
// source — the README documents ManifestStore.read()/.validate() but
// not the assertion-enumeration surface. Do NOT trust this as correct.
// Before merging: console.log(JSON.stringify(manifestStore, null, 2))
// (or inspect it in a debugger) against a real test asset carrying a
// sen.network.* assertion, and fix extractSenAssertions() to match
// whatever shape actually comes back. Until then this function is
// wrapped in a try/catch and will just report "unavailable" rather
// than break /verify if it's wrong.

import { createAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore } from '@trustnxt/c2pa-ts/manifest';

const ATTESTATION_TEXT =
  "Cryptographic structure, content hashes, and signature math checked " +
  "against the embedded C2PA manifest. Signing authority has NOT been " +
  "checked against an external Trust List — chain-of-trust validation " +
  "is not yet implemented. A structurally valid signature does not " +
  "confirm the signer's real-world identity or legitimacy.";

const SEN_LABELS = [
  'sen.network.telemetry',
  'sen.network.pricing',
  'sen.network.semantics'
];

// UNCONFIRMED — see header note. This is a best-effort guess at the
// c2pa-ts assertion-access API, not a confirmed one. Test against a
// real SEN-signed asset before relying on this in production.
function extractSenAssertions(manifestStore) {
  const found = {};
  try {
    // Guess: active manifest may be exposed as manifestStore.manifests
    // (a Map or array) — adjust once the real shape is confirmed.
    const manifests = manifestStore?.manifests;
    if (!manifests) return { available: false, reason: 'no manifests property found on manifestStore' };

    const manifestList = manifests instanceof Map ? [...manifests.values()] : manifests;

    for (const manifest of manifestList) {
      const assertions = manifest?.assertions ?? manifest?.assertionStore?.assertions;
      if (!assertions) continue;

      const assertionList = assertions instanceof Map ? [...assertions.values()] : assertions;

      for (const assertion of assertionList) {
        const label = assertion?.label ?? assertion?.fullLabel;
        if (label && SEN_LABELS.includes(label)) {
          found[label] = assertion?.data ?? assertion?.content ?? null;
        }
      }
    }

    return { available: Object.keys(found).length > 0, assertions: found };
  } catch (err) {
    return { available: false, reason: `extraction failed: ${err.message}` };
  }
}

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
    let manifestStore;
    try {
      const superBox = SuperBox.fromBuffer(jumbf);
      manifestStore = ManifestStore.read(superBox);
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

    // SEN addition — best-effort, non-blocking. See UNCONFIRMED note above.
    const senData = extractSenAssertions(manifestStore);

    return jsonResponse(200, {
      status: "verified",
      gateway: "Trust Oracle (/verify)",
      asset: assetUrl,
      assertion: ATTESTATION_TEXT,
      validationResult,
      sen: senData,
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
