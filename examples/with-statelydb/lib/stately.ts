import { createClient } from "./schema/index.js";
import { nodeTransport } from "@stately-cloud/client/node";

if (!process.env.STATELY_ACCESS_KEY) {
  throw new Error("Missing STATELY_ACCESS_KEY");
}
if (!process.env.STATELY_STORE_ID) {
  throw new Error("Missing STATELY_STORE_ID");
}

export const statelyClient = createClient({
  storeId: BigInt(process.env.STATELY_STORE_ID),
  transport: nodeTransport,
  region: "us-east-1"
});
