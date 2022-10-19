import type {
  ClientMessage,
  ServerMessage,
} from "@vercel/turbopack-runtime/types/protocol";
import type {
  ChunkUpdateCallback,
  TurbopackGlobals,
} from "@vercel/turbopack-runtime/types";

import { addEventListener, sendMessage } from "./websocket";

declare var globalThis: TurbopackGlobals;

export function connect() {
  addEventListener((event) => {
    switch (event.type) {
      case "connected":
        handleSocketConnected();
        break;
      case "message":
        handleSocketMessage(event.message);
        break;
    }
  });

  const queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS;
  if (queued != null && !Array.isArray(queued)) {
    throw new Error("A separate HMR handler was already registered");
  }
  globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = {
    push: ([chunkPath, callback]: [string, ChunkUpdateCallback]) => {
      onChunkUpdate(chunkPath, callback);
    },
  };

  if (Array.isArray(queued)) {
    for (const [chunkPath, callback] of queued) {
      onChunkUpdate(chunkPath, callback);
    }
  }

  subscribeToInitialCssChunksUpdates();
}

const chunkUpdateCallbacks: Map<string, ChunkUpdateCallback[]> = new Map();

function sendJSON(message: ClientMessage) {
  sendMessage(JSON.stringify(message));
}

function subscribeToChunkUpdates(chunkPath: string) {
  sendJSON({
    type: "subscribe",
    chunkPath,
  });
}

function handleSocketConnected() {
  for (const chunkPath of chunkUpdateCallbacks.keys()) {
    subscribeToChunkUpdates(chunkPath);
  }
}

function handleSocketMessage(event: MessageEvent) {
  const data: ServerMessage = JSON.parse(event.data);

  triggerChunkUpdate(data);
}

export function onChunkUpdate(
  chunkPath: string,
  callback: ChunkUpdateCallback
) {
  const callbacks = chunkUpdateCallbacks.get(chunkPath);
  if (!callbacks) {
    chunkUpdateCallbacks.set(chunkPath, [callback]);
  } else {
    callbacks.push(callback);
  }

  subscribeToChunkUpdates(chunkPath);
}

function triggerChunkUpdate(update: ServerMessage) {
  const callbacks = chunkUpdateCallbacks.get(update.chunkPath);
  if (!callbacks) {
    return;
  }

  try {
    for (const callback of callbacks) {
      callback(update);
    }
  } catch (err) {
    console.error(
      `An error occurred during the update of chunk \`${update.chunkPath}\``,
      err
    );
    location.reload();
  }
}

// Unlike ES chunks, CSS chunks cannot contain the logic to accept updates.
// They must be reloaded here instead.
function subscribeToInitialCssChunksUpdates() {
  const initialCssChunkLinks: NodeListOf<HTMLLinkElement> =
    document.head.querySelectorAll("link");
  initialCssChunkLinks.forEach((link) => {
    if (!link.href) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin) return;
    const chunkPath = url.pathname.slice(1);

    onChunkUpdate(chunkPath, (update) => {
      switch (update.type) {
        case "restart": {
          console.info(`Reloading CSS chunk \`${chunkPath}\``);
          link.replaceWith(link);
          break;
        }
        case "partial":
          throw new Error(`partial CSS chunk updates are not supported`);
        default:
          throw new Error(`unknown update type \`${update}\``);
      }
    });
  });
}
