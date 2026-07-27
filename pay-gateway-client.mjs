// test-assets/pay-gateway-client.mjs (or repo root — wherever you keep it)
//
// UPDATED for x402 v2. The v1 package this was originally based on
// (x402-axios, from the HeimLabs tutorial) is now deprecated — its
// internal dependency versions no longer resolve on npm, which is what
// caused the ETARGET error. Migrated to the confirmed v2 API per
// Coinbase's own migration guide (docs.cdp.coinbase.com/x402/migration-guide)
// and the x402 project's official buyer quickstart.
//
// !! THIS SPENDS REAL BASE MAINNET USDC !! Confirm the wallet is funded
// with a small, deliberate amount before running.

import { CdpClient } from "@coinbase/cdp-sdk";
import axios from "axios";
import { config } from "dotenv";
import { toAccount } from "viem/accounts";
import { x402Client, wrapAxiosWithPayment, x402HTTPClient } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

config();

const apiKeyId = process.env.CDP_API_KEY_ID;
const apiKeySecret = process.env.CDP_API_KEY_SECRET;
const walletSecret = process.env.CDP_WALLET_SECRET;

const gatewayBaseURL = process.env.GATEWAY_BASE_URL || "https://x402-dual-gateway.andeglenderson.workers.dev";
const gatewayPath = process.env.GATEWAY_PATH || "/verify";
const testAssetUrl = process.env.TEST_ASSET_URL || "https://raw.githubusercontent.com/contentauth/c2pa-js-legacy/main/tools/testing/fixtures/images/CAICAI.jpg";

if (!apiKeyId || !apiKeySecret || !walletSecret) {
  console.error("Missing required CDP environment variables (CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET)");
  process.exit(1);
}

async function main() {
  console.log("Initializing CDP wallet client...");
  const cdpClient = new CdpClient();

  const serverAccount = await cdpClient.evm.getOrCreateAccount({
    name: "AmoraGatewayTestPayer1",
  });

  const signer = toAccount(serverAccount);
  console.log(`Wallet address: ${signer.address}`);
  console.log(`Target: ${gatewayBaseURL}${gatewayPath}?asset=${testAssetUrl}`);
  console.log("Make sure this wallet is funded with a small amount of Base mainnet USDC before this runs for real.");

  const x402client = new x402Client();
  registerExactEvmScheme(x402client, { signer });

  const api = wrapAxiosWithPayment(
    axios.create({ baseURL: gatewayBaseURL }),
    x402client
  );

  try {
    const response = await api.get(gatewayPath, {
      params: { asset: testAssetUrl },
    });

    console.log("\nRequest succeeded.");
    console.log("Response status:", response.status);
    console.log("Response data:", JSON.stringify(response.data, null, 2));

    try {
      const httpClient = new x402HTTPClient(x402client);
      const paymentResponse = httpClient.getPaymentSettleResponse(
        (name) => response.headers[name.toLowerCase()]
      );
      console.log("\nPayment settled:", paymentResponse);
      if (paymentResponse?.transaction) {
        console.log(`View transaction: https://basescan.org/tx/${paymentResponse.transaction}`);
      }
    } catch (receiptErr) {
      console.log("\nCould not extract payment receipt:", receiptErr.message);
      console.log("This is non-fatal — the request above already tells us whether payment/delivery worked.");
    }
  } catch (err) {
    console.error("\nRequest failed.");
    console.error("Error message:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", JSON.stringify(err.response.data, null, 2));
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("\nUnhandled error:", err.message);
  process.exit(1);
});

