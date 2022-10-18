import type {
  ClientMessage,
  ServerMessage,
} from "@vercel/turbopack-runtime/types/protocol";
import type {
  ChunkId,
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
    push: ([chunkId, callback]: [ChunkId, ChunkUpdateCallback]) => {
      onChunkUpdate(chunkId, callback);
    },
  };

  if (Array.isArray(queued)) {
    for (const [chunkId, callback] of queued) {
      onChunkUpdate(chunkId, callback);
    }
  }

  subscribeToInitialCssChunksUpdates();
}

const chunkUpdateCallbacks: Map<ChunkId, ChunkUpdateCallback[]> = new Map();

function sendJSON(message: ClientMessage) {
  sendMessage(JSON.stringify(message));
}

function subscribeToChunkUpdates(chunkId: ChunkId) {
  sendJSON({
    type: "subscribe",
    chunkId,
  });
}

function handleSocketConnected() {
  for (const chunkId of chunkUpdateCallbacks.keys()) {
    subscribeToChunkUpdates(chunkId);
  }
}

function handleSocketMessage(event: MessageEvent) {
  const data: ServerMessage = JSON.parse(event.data);

  triggerChunkUpdate(data);
}

export function onChunkUpdate(chunkId: ChunkId, callback: ChunkUpdateCallback) {
  const callbacks = chunkUpdateCallbacks.get(chunkId);
  if (!callbacks) {
    chunkUpdateCallbacks.set(chunkId, [callback]);
  } else {
    callbacks.push(callback);
  }

  subscribeToChunkUpdates(chunkId);
}

function triggerChunkUpdate(update: ServerMessage) {
  const callbacks = chunkUpdateCallbacks.get(update.chunkId);
  if (!callbacks) {
    return;
  }

  try {
    for (const callback of callbacks) {
      callback(update);
    }
  } catch (err) {
    console.error(
      `An error occurred during the update of chunk \`${update.chunkId}\``,
      err
    );
    location.reload();
  }
}

// Unlike ES chunks, CSS chunks cannot contain the logic to accept updates.
// They must be reloaded here instead.
function subscribeToInitialCssChunksUpdates() {
  const initialCssChunkLinks: NodeListOf<HTMLLinkElement> =
    document.head.querySelectorAll("link[data-turbopack-chunk-id]");
  initialCssChunkLinks.forEach((link) => {
    const chunkId = link.dataset.turbopackChunkId!;

    onChunkUpdate(chunkId, (update) => {
      switch (update.type) {
        case "restart": {
          console.info(`Reloading CSS chunk \`${chunkId}\``);
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
