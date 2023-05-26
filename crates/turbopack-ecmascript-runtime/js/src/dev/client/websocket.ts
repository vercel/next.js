// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/client/dev/error-overlay/websocket.ts

let source: WebSocket;
const eventCallbacks: ((event: WebsocketEvent) => void)[] = [];

// TODO: add timeout again
// let lastActivity = Date.now()

function getSocketProtocol(assetPrefix: string): string {
  let protocol = location.protocol;

  try {
    // assetPrefix is a url
    protocol = new URL(assetPrefix).protocol;
  } catch (_) {}

  return protocol === "http:" ? "ws" : "wss";
}

type WebsocketEvent =
  | {
      type: "connected";
    }
  | {
      type: "message";
      message: MessageEvent;
    };

export function addEventListener(cb: (event: WebsocketEvent) => void) {
  eventCallbacks.push(cb);
}

export function sendMessage(data: any) {
  if (!source || source.readyState !== source.OPEN) return;
  return source.send(data);
}

export type HMROptions = {
  path: string;
  assetPrefix: string;
  timeout?: number;
  log?: boolean;
};

export function connectHMR(options: HMROptions) {
  const { timeout = 5 * 1000 } = options;

  function init() {
    if (source) source.close();

    console.log("[HMR] connecting...");

    function handleOnline() {
      eventCallbacks.forEach((cb) => {
        cb({
          type: "connected",
        });
      });

      if (options.log) console.log("[HMR] connected");
      // lastActivity = Date.now()
    }

    function handleMessage(event: MessageEvent) {
      // lastActivity = Date.now()

      eventCallbacks.forEach((cb) => {
        cb({
          type: "message",
          message: event,
        });
      });
    }

    // let timer: NodeJS.Timeout

    function handleDisconnect() {
      source.close();
      setTimeout(init, timeout);
    }

    const { hostname, port } = location;
    const protocol = getSocketProtocol(options.assetPrefix || "");
    const assetPrefix = options.assetPrefix.replace(/^\/+/, "");

    let url = `${protocol}://${hostname}:${port}${
      assetPrefix ? `/${assetPrefix}` : ""
    }`;

    if (assetPrefix.startsWith("http")) {
      url = `${protocol}://${assetPrefix.split("://")[1]}`;
    }

    source = new window.WebSocket(`${url}${options.path}`);
    source.onopen = handleOnline;
    source.onerror = handleDisconnect;
    source.onmessage = handleMessage;
  }

  init();
}
