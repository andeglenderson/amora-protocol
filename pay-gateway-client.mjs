// test-assets/pay-gateway-client.mjs
//
// A real paying x402 client aimed at Amora's OWN Gateway, adapted from the
// confirmed HeimLabs tutorial pattern (coinbase/x402 + CDP SDK + x402-axios,
// Base mainnet — https://medium.com/@heimlabs/pay-for-pinata-x402-api...).
// That article pays Pinata; this points the same pattern at your own
// /verify or /stamp endpoint instead, so you get a genuine end-to-end test:
// wallet -> 402 challenge -> automatic payment -> real response.
//
// HONEST SCOPE: withPaymentInterceptor handles any spec-compliant x402
// 402 response generically — it doesn't need to know Amora-specific
// details. But I haven't seen src/index.js or payments.js in this chat,
// so I can't confirm the exact shape of the 402 challenge your router
// returns. If this fails at the payment step (not the request step),
// that's the most likely place to look — compare what your router sends
// against the x402 spec's expected fields.
//
// !! THIS SPENDS REAL BASE MAINNET USDC !! Confirm the wallet is funded
// with a small, deliberate amount before running. Not a testnet script —
// per what's been discussed, Amora has fully migrated off Base Sepolia.

import { CdpClient } from "@coinbase/cdp-sdk";
import axios from "axios";
import { config } from "dotenv";
import { toAccount } from "viem/accounts";
import { decodeXPaymentResponse, withPaymentInterceptor } from "x402-axios";

config();

const apiKeyId = process.env.CDP_API_KEY_ID;
const apiKeySecret = process.env.CDP_API_KEY_SECRET;
const walletSecret = process.env.CDP_WALLET_SECRET;

// Point this at your live Gateway. Defaults to /verify with a small public
// test image, since that's a read/verification call — cheaper and lower-
// consequence to test against repeatedly than /stamp.
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

  const account = toAccount(serverAccount);
  console.log(`Wallet address: ${account.address}`);
  console.log(`Target: ${gatewayBaseURL}${gatewayPath}?asset=${testAssetUrl}`);
  console.log("Make sure this wallet is funded with a small amount of Base mainnet USDC before this runs for real.");

  const x402Api = withPaymentInterceptor(
    axios.create({ baseURL: gatewayBaseURL }),
    account
  );

  try {
    const response = await x402Api.get(gatewayPath, {
      params: { asset: testAssetUrl },
    });

    console.log("\nRequest succeeded.");
    console.log("Response status:", response.status);
    console.log("Response data:", JSON.stringify(response.data, null, 2));

    const xPaymentHeader = response.headers["x-payment-response"];
    if (xPaymentHeader) {
      try {
        const paymentInfo = decodeXPaymentResponse(xPaymentHeader);
        console.log("\nPayment info:", paymentInfo);
        if (paymentInfo.transaction) {
          console.log(`View transaction: https://basescan.org/tx/${paymentInfo.transaction}`);
        }
      } catch (decodeErr) {
        console.log("Could not decode x-payment-response header:", decodeErr.message);
      }
    } else {
      console.log("\nNo x-payment-response header present — either no payment was required, or the header name/shape differs from what this script expects. Worth checking payments.js against this.");
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

