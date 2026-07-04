// TEST ONLY — throwaway route, not part of production Amora logic.
// Purpose: confirm @trustnxt/c2pa-ts loads and runs inside a Cloudflare
// Worker, against a real C2PA-signed test image. Nothing here touches
// payments, the ledger, or /verify. Delete this route once the test
// is complete either way.
//
// SETUP (run once, from GitHub mobile or wherever you edit package.json):
//   Add to package.json dependencies:  "@trustnxt/c2pa-ts": "latest"
//   Cloudflare Workers builds via Wrangler/esbuild, which reads
//   package.json automatically on deploy — no separate install step
//   needed on your end beyond committing the dependency.
//
// ADD THIS ROUTE to index.js (temporarily) inside the fetch handler,
// anywhere before the /verify or /stamp checks:
//
//   if (url.pathname === "/test-c2pa") {
//     return await testC2paParse();
//   }
//
// Then deploy as usual via your existing GitHub Actions pipeline, and
// hit it via reqbin:
//   GET https://x402-dual-gateway.andeglenderson.workers.dev/test-c2pa
// No X-PAYMENT header needed — this route bypasses payment entirely,
// it's test-only.

import { Asset, JPEG } from '@trustnxt/c2pa-ts/asset';
import { ManifestStore } from '@trustnxt/c2pa-ts/manifest';

const TEST_IMAGE_URL =
  'https://c2pa.org/public-testfiles/image/jpeg/truepic-20230212-camera.jpg';

export async function testC2paParse() {
  const log = [];

  try {
    log.push('Step 1: fetching test image...');
    const res = await fetch(TEST_IMAGE_URL);

    if (!res.ok) {
      return jsonResponse({
        step: 'fetch',
        success: false,
        error: `Failed to fetch test image: ${res.status}`,
        log
      });
    }

    const arrayBuffer = await res.arrayBuffer();
    const buf = new Uint8Array(arrayBuffer);
    log.push(`Step 2: fetched ${buf.length} bytes.`);

    if (!JPEG.canRead(buf)) {
      return jsonResponse({
        step: 'format-check',
        success: false,
        error: 'JPEG.canRead() returned false — library did not recognize the file format.',
        log
      });
    }
    log.push('Step 3: JPEG.canRead() confirmed valid JPEG structure.');

    const asset = new JPEG(buf);
    log.push('Step 4: Asset object constructed.');

    const jumbf = asset.getManifestJUMBF();

    if (!jumbf) {
      return jsonResponse({
        step: 'manifest-extraction',
        success: false,
        error: 'No embedded C2PA manifest (JUMBF box) found in this file.',
        log
      });
    }
    log.push(`Step 5: JUMBF manifest box found, ${jumbf.length} bytes.`);

    // Attempt to parse the manifest store from the JUMBF box.
    const manifestStore = ManifestStore.read(jumbf);
    log.push('Step 6: ManifestStore.read() succeeded — manifest parsed.');

    return jsonResponse({
      step: 'complete',
      success: true,
      message: 'c2pa-ts successfully ran inside the Worker and parsed a real C2PA manifest.',
      manifestSummary: {
        manifestCount: manifestStore?.manifests?.length ?? 'unknown — inspect manually',
      },
      log
    });

  } catch (err) {
    return jsonResponse({
      step: 'exception',
      success: false,
      error: err.message,
      stack: err.stack,
      log
    });
  }
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
