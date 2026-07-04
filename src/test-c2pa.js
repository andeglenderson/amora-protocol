// TEST ONLY — throwaway route, not part of production Amora logic.
// Purpose: confirm @trustnxt/c2pa-ts loads and runs inside a Cloudflare
// Worker, against a real C2PA-signed test image.
//
// NOTE: this library is early-stage and its API has changed between
// versions (older: JPEG/PNG/BMFF classes with canRead(); current:
// a single async createAsset() factory function). This version uses
// the current documented API. If this still doesn't match what's
// actually installed, the safest next move is the introspection
// fallback described in the catch block below.

import { MalformedContentError } from '@trustnxt/c2pa-ts';
import { createAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore } from '@trustnxt/c2pa-ts/manifest';

const TEST_IMAGE_URL =
  'https://raw.githubusercontent.com/c2pa-org/public-testfiles/main/legacy/1.4/image/jpeg/adobe-20220124-A.jpg';

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

    let asset;
    try {
      asset = await createAsset(buf);
      log.push('Step 3: createAsset() succeeded — format recognized.');
    } catch (formatErr) {
      return jsonResponse({
        step: 'format-detection',
        success: false,
        error: `createAsset() failed: ${formatErr.message}`,
        log
      });
    }

    const jumbf = await asset.getManifestJUMBF();

    if (!jumbf) {
      return jsonResponse({
        step: 'manifest-extraction',
        success: false,
        error: 'No embedded C2PA manifest (JUMBF box) found in this file.',
        log
      });
    }
    log.push(`Step 4: JUMBF manifest box found, ${jumbf.length ?? 'unknown'} bytes.`);

    const superBox = SuperBox.fromBuffer(jumbf);
    log.push('Step 5: SuperBox.fromBuffer() succeeded — JUMBF structure parsed.');

    const manifestStore = ManifestStore.read(superBox);
    log.push('Step 6: ManifestStore.read() succeeded — manifest parsed.');

    return jsonResponse({
      step: 'complete',
      success: true,
      message: 'c2pa-ts successfully ran inside the Worker and parsed a real C2PA manifest.',
      log
    });

  } catch (err) {
    // If this still fails on an import/API mismatch, the fastest way
    // forward is introspection rather than another guess: temporarily
    // replace this whole function body with:
    //
    //   import * as c2paAsset from '@trustnxt/c2pa-ts/asset';
    //   return new Response(JSON.stringify(Object.keys(c2paAsset)));
    //
    // That will print the *actual* exported names this installed
    // version provides, ending the guessing entirely.
    return jsonResponse({
      step: 'exception',
      success: false,
      error: err.message,
      stack: err.stack,
      log,
      hint: 'If this is an import/export mismatch, see the introspection comment in this catch block for a guess-free fix.'
    });
  }
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
