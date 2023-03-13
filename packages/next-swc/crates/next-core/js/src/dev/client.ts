import { connect } from "./hmr-client";
import { connectHMR } from "./websocket";
import { register, ReactDevOverlay } from "../overlay/client";

export function initializeHMR(options: { assetPrefix: string }) {
  connect({
    assetPrefix: options.assetPrefix,
  });
  connectHMR({
    assetPrefix: options.assetPrefix,
    log: true,
    path: "/turbopack-hmr",
  });
  register();
}

export { ReactDevOverlay };
