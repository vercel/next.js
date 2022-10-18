import { connect } from "./hmr-client";
import { connectHMR } from "./websocket";

export function initializeHMR(options: { assetPrefix: string }) {
  connect();
  connectHMR({
    path: "/turbopack-hmr",
    assetPrefix: options.assetPrefix,
  });
}
