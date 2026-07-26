// test-assets/dump-manifest.mjs
//
// Purpose: print the REAL structure @trustnxt/c2pa-ts returns for a
// signed asset, so we can confirm (or fix) extractSenAssertions() in
// c2pa.js against ground truth instead of guessing.
//
// Based on: (1) TrustNXT's own README example for asset.dumpInfo() /
// getManifestJUMBF() / SuperBox.fromBuffer() — confirmed from their
// public docs. (2) The ManifestStore.read() -> .validate() sequence,
// which is already confirmed working in your deployed c2pa.js.
//
// Usage: node test-assets/dump-manifest.mjs <path-to-signed-asset.jpg>

import * as fs from 'node:fs/promises';
import { createAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore } from '@trustnxt/c2pa-ts/manifest';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node dump-manifest.mjs <path-to-signed-asset.jpg>');
  process.exit(1);
}

const buf = await fs.readFile(path);

let asset;
try {
  asset = await createAsset(buf);
} catch (err) {
  console.error('Unknown or unsupported file format:', err.message);
  process.exit(1);
}

console.log('=== asset.dumpInfo() ===');
console.log(asset.dumpInfo());

const jumbf = await asset.getManifestJUMBF();
if (!jumbf) {
  console.log('No embedded C2PA manifest found in this file. Nothing to inspect.');
  process.exit(0);
}

const superBox = SuperBox.fromBuffer(jumbf);
console.log('\n=== JUMBF structure ===');
console.log(superBox.toString());

const manifestStore = ManifestStore.read(superBox);
const validationResult = await manifestStore.validate(asset);

const replacer = (key, value) => (typeof value === 'bigint' ? value.toString() : value);

console.log('\n=== validationResult ===');
console.log(JSON.stringify(validationResult, replacer, 2));

console.log('\n=== RAW manifestStore (this is the ground truth — use this to fix extractSenAssertions() if needed) ===');
console.log(JSON.stringify(manifestStore, replacer, 2));

// --- The exact function currently deployed in c2pa.js, run against ---
// --- the real manifestStore above, so we can see if it actually works ---
const SEN_LABELS = [
  'sen.network.telemetry',
  'sen.network.pricing',
  'sen.network.semantics'
];

function extractSenAssertions(manifestStore) {
  const found = {};
  try {
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

console.log('\n=== extractSenAssertions() result — the deployed c2pa.js logic, tested against the real manifestStore above ===');
console.log(JSON.stringify(extractSenAssertions(manifestStore), null, 2));

