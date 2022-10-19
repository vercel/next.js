import { connect } from "./hmr-client";
import { connectHMR } from "./websocket";

export function initializeHMR(options: { assetPrefix: string }) {
  connect({
    assetPrefix: options.assetPrefix,
  });
  connectHMR({
    path: "/turbopack-hmr",
    assetPrefix: options.assetPrefix,
  });
}
