// TEST ONLY — throwaway route, not part of production Amora logic.
// Purpose: confirm @trustnxt/c2pa-ts loads and runs inside a Cloudflare
// Worker, against a real C2PA-signed test image.
//
// STATUS: parsing confirmed working (fetch -> createAsset -> JUMBF ->
// SuperBox -> ManifestStore.read all succeed). This version adds a safe
// introspection step to discover the actual validation API surface
// (ValidationResult / ValidationStatusCode are confirmed to exist per
// the library's own README usage example, but the exact method name
// to trigger validation is not yet confirmed) rather than guessing a
// method name and burning another deploy cycle on a wrong guess.

import { createAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore, ValidationResult, ValidationStatusCode } from '@trustnxt/c2pa-ts/manifest';

const TEST_IMAGE_URL =
  'https://raw.githubusercontent.com/c2pa-org/public-testfiles/main/legacy/1.4/image/jpeg/adobe-20220124-CA.jpg';

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

    const asset = await createAsset(buf);
    log.push('Step 3: createAsset() succeeded — format recognized.');

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

    // --- INTROSPECTION STEP ---
    // Rather than guess a validate() method name, list what's actually
    // available on the manifestStore instance and on the ManifestStore,
    // ValidationResult, and ValidationStatusCode exports themselves.
    const introspection = {};

    try {
      introspection.manifestStoreInstanceMethods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(manifestStore)
      );
    } catch (e) {
      introspection.manifestStoreInstanceMethodsError = e.message;
    }

    try {
      introspection.manifestStoreOwnKeys = Object.keys(manifestStore);
    } catch (e) {
      introspection.manifestStoreOwnKeysError = e.message;
    }

    try {
      introspection.ManifestStoreStaticMethods = Object.getOwnPropertyNames(ManifestStore);
    } catch (e) {
      introspection.ManifestStoreStaticMethodsError = e.message;
    }

    try {
      introspection.ValidationResultKeys = ValidationResult
        ? Object.getOwnPropertyNames(ValidationResult)
        : 'ValidationResult is undefined';
    } catch (e) {
      introspection.ValidationResultKeysError = e.message;
    }

    try {
      introspection.ValidationStatusCodeValues = ValidationStatusCode
        ? Object.keys(ValidationStatusCode)
        : 'ValidationStatusCode is undefined';
    } catch (e) {
      introspection.ValidationStatusCodeValuesError = e.message;
    }

    // Also try to see if there are manifests inside the store, and what
    // shape a single manifest object has — useful for the next step
    // (checking signer/certificate info) regardless of the validate()
    // method name.
    try {
      const manifests = manifestStore.manifests ?? manifestStore.getManifests?.();
      if (manifests) {
        introspection.manifestsFound =
          typeof manifests === 'object' ? Object.keys(manifests).length : 'not an object';
        const firstManifest = Array.isArray(manifests)
          ? manifests[0]
          : Object.values(manifests)[0];
        if (firstManifest) {
          introspection.firstManifestInstanceMethods = Object.getOwnPropertyNames(
            Object.getPrototypeOf(firstManifest)
          );
          introspection.firstManifestOwnKeys = Object.keys(firstManifest);
        }
      } else {
        introspection.manifestsFound = 'no .manifests property or getManifests() found';
      }
    } catch (e) {
      introspection.manifestsIntrospectionError = e.message;
    }

    log.push('Step 7: introspection complete — see introspection field.');

    return jsonResponse({
      step: 'complete',
      success: true,
      message: 'c2pa-ts successfully ran inside the Worker and parsed a real C2PA manifest.',
      introspection,
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
