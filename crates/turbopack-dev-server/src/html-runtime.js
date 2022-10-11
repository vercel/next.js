/**
 * The runtime of the Turbopack dev server's HTML entry point.
 */
let socket;
const chunkUpdateCallbacks = new Map();

function subscribeToChunkUpdates(chunkId) {
  socket.send(JSON.stringify(chunkId));
}

function onSocketConnected(connectedSocket) {
  socket = connectedSocket;

  let queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS;
  globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = { push: addChunkUpdateListener };
  if (Array.isArray(queued)) {
    for (const job of queued) {
      addChunkUpdateListener(job);
    }
  }

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    triggerChunkUpdate(data.type, data.id, data.instruction);
  };
  socket.onclose = () => {
    console.error("Connection to dev server lost! Reloading");
    location.reload();
  };
  socket.onerror = (e) => {
    console.error(e);
    location.reload();
  };
}

function addChunkUpdateListener([chunkId, callback]) {
  let callbacks = chunkUpdateCallbacks.get(chunkId);
  if (!callbacks) {
    callbacks = [callback];
    chunkUpdateCallbacks.set(chunkId, callbacks);
    subscribeToChunkUpdates(chunkId);
  } else {
    callbacks.push(callback);
  }
}

function triggerChunkUpdate(updateType, chunkId, instruction) {
  const callbacks = chunkUpdateCallbacks.get(chunkId);
  if (!callbacks) {
    return;
  }

  try {
    for (const callback of callbacks) {
      callback(updateType, instruction);
    }
  } catch (err) {
    console.error(`An error occurred during the update of chunk \`${chunkId}\``, err);
    location.reload();
  }
}

// Unlike ES chunks, CSS chunks cannot contain the logic to accept updates.
// They must be reloaded here instead.
function subscribeToInitialCssChunksUpdates() {
  const initialCssChunkLinks = document.head.querySelectorAll("link[data-turbopack-chunk-id]");
  for (const link of initialCssChunkLinks) {
    const chunkId = link.dataset.turbopackChunkId;

    addChunkUpdateListener(chunkId, (updateType) => {
      switch (updateType) {
        case "restart": {
          console.info(`Reloading CSS chunk \`${chunkId}\``);
          link.replaceWith(link);
          break;
        }
        case "partial":
          throw new Error(`partial CSS chunk updates are not supported`);
        default:
          throw new Error(`unknown update type \`${updateType}\``);
      }
    });
  }
}

if (typeof WebSocket !== "undefined") {
  const connectingSocket = new WebSocket("ws" + location.origin.slice(4));

  connectingSocket.onopen = () => {
    onSocketConnected(connectingSocket);
  };
}

globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS || [];

subscribeToInitialCssChunksUpdates();
