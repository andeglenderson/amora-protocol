// TEST ONLY — throwaway route, not part of production Amora logic.
// Purpose: confirm @trustnxt/c2pa-ts loads and runs inside a Cloudflare
// Worker. Steps 1-7 (fetch through introspection) are confirmed working.
// This version adds the actual validate() call, using the CONFIRMED
// real method names from introspection: manifestStore.validate(asset)
// and ValidationResult.fromError() as an error fallback.
//
// Test expectation: this specific file (adobe-20220124-CA.jpg) was
// signed with Adobe's C2PA Tool TEST certificate, which the C2PA
// testfiles project explicitly documents as NOT on the official trust
// list. A correctly working trust-chain check should report
// SigningCredentialTrusted as false/failed for this file.

import { createAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore, ValidationResult } from '@trustnxt/c2pa-ts/manifest';

const TEST_IMAGE_URL =
  'https://raw.githubusercontent.com/c2pa-org/public-testfiles/main/legacy/1.4/image/jpeg/adobe-20220124-CA.jpg';

export async function testC2paParse() {
  const log = [];

  try {
    log.push('Step 1: fetching test image...');
    const res = await fetch(TEST_IMAGE_URL);
    if (!res.ok) {
      return jsonResponse({ step: 'fetch', success: false, error: `Failed to fetch: ${res.status}`, log });
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    log.push(`Step 2: fetched ${buf.length} bytes.`);

    const asset = await createAsset(buf);
    log.push('Step 3: createAsset() succeeded.');

    const jumbf = await asset.getManifestJUMBF();
    if (!jumbf) {
      return jsonResponse({ step: 'manifest-extraction', success: false, error: 'No JUMBF box found.', log });
    }
    log.push(`Step 4: JUMBF box found, ${jumbf.length ?? 'unknown'} bytes.`);

    const superBox = SuperBox.fromBuffer(jumbf);
    log.push('Step 5: SuperBox.fromBuffer() succeeded.');

    const manifestStore = ManifestStore.read(superBox);
    log.push('Step 6: ManifestStore.read() succeeded.');

    // --- THE ACTUAL VALIDATION CALL ---
    let validationResult;
    try {
      validationResult = await manifestStore.validate(asset);
      log.push('Step 7: manifestStore.validate(asset) completed.');
    } catch (validateErr) {
      validationResult = ValidationResult.fromError(validateErr);
      log.push(`Step 7: validate() threw, caught via ValidationResult.fromError(): ${validateErr.message}`);
    }

    return jsonResponse({
      step: 'complete',
      success: true,
      message: 'Validation call completed — see validationResult for trust/signature status.',
      validationResult,
      log
    });

  } catch (err) {
    return jsonResponse({ step: 'exception', success: false, error: err.message, stack: err.stack, log });
  }
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
