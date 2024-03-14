import { connect } from "@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client";
import {
  connectHMR,
  addMessageListener,
  sendMessage,
} from "@vercel/turbopack-ecmascript-runtime/dev/client/websocket";

export function initializeHMR(options: { assetPrefix: string }) {
  connect({
    addMessageListener,
    sendMessage,
    onUpdateError: console.error,
  });
  connectHMR({
    assetPrefix: options.assetPrefix,
    log: true,
    path: "/turbopack-hmr",
  });
}
