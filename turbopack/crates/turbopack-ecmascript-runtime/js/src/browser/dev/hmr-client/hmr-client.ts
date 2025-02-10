/// <reference path="../../../shared/runtime-types.d.ts" />
/// <reference path="../../runtime/base/dev-globals.d.ts" />
/// <reference path="../../runtime/base/dev-protocol.d.ts" />
/// <reference path="../../runtime/base/dev-extensions.ts" />

type SendMessage = (msg: any) => void;
export type WebSocketMessage =
  | {
      type: "turbopack-connected";
    }
  | {
      type: "turbopack-message";
      data: Record<string, any>;
    };


export type ClientOptions = {
  addMessageListener: (cb: (msg: WebSocketMessage) => void) => void;
  sendMessage: SendMessage;
  onUpdateError: (err: unknown) => void;
};

export function connect({
  addMessageListener,
  sendMessage,
  onUpdateError = console.error,
}: ClientOptions) {
  addMessageListener((msg) => {
    switch (msg.type) {
      case "turbopack-connected":
        handleSocketConnected(sendMessage);
        break;
      default:
        try {
          if (Array.isArray(msg.data)) {
            for (let i = 0; i < msg.data.length; i++) {
              handleSocketMessage(msg.data[i] as ServerMessage);
            }
          } else {
            handleSocketMessage(msg.data as ServerMessage);
          }
          applyAggregatedUpdates();
        } catch (e: unknown) {
          console.warn(
            "[Fast Refresh] performing full reload\n\n" +
              "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" +
              "You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n" +
              "Consider migrating the non-React component export to a separate file and importing it into both files.\n\n" +
              "It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n" +
              "Fast Refresh requires at least one parent function component in your React tree."
          );
          onUpdateError(e);
          location.reload();
        }
        break;
    }
  });

  const queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS;
  if (queued != null && !Array.isArray(queued)) {
    throw new Error("A separate HMR handler was already registered");
  }
  globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = {
    push: ([chunkPath, callback]: [ChunkPath, UpdateCallback]) => {
      subscribeToChunkUpdate(chunkPath, sendMessage, callback);
    },
  };

  if (Array.isArray(queued)) {
    for (const [chunkPath, callback] of queued) {
      subscribeToChunkUpdate(chunkPath, sendMessage, callback);
    }
  }
}

type UpdateCallbackSet = {
  callbacks: Set<UpdateCallback>;
  unsubscribe: () => void;
};

const updateCallbackSets: Map<ResourceKey, UpdateCallbackSet> = new Map();

function sendJSON(sendMessage: SendMessage, message: ClientMessage) {
  sendMessage(JSON.stringify(message));
}

type ResourceKey = string;

function resourceKey(resource: ResourceIdentifier): ResourceKey {
  return JSON.stringify({
    path: resource.path,
    headers: resource.headers || null,
  });
}

function subscribeToUpdates(
  sendMessage: SendMessage,
  resource: ResourceIdentifier
): () => void {
  sendJSON(sendMessage, {
    type: "turbopack-subscribe",
    ...resource,
  });

  return () => {
    sendJSON(sendMessage, {
      type: "turbopack-unsubscribe",
      ...resource,
    });
  };
}

function handleSocketConnected(sendMessage: SendMessage) {
  for (const key of updateCallbackSets.keys()) {
    subscribeToUpdates(sendMessage, JSON.parse(key));
  }
}

// we aggregate all pending updates until the issues are resolved
const chunkListsWithPendingUpdates: Map<ResourceKey, PartialServerMessage> =
  new Map();

function aggregateUpdates(msg: PartialServerMessage) {
  const key = resourceKey(msg.resource);
  let aggregated = chunkListsWithPendingUpdates.get(key);

  if (aggregated) {
    aggregated.instruction = mergeChunkListUpdates(
      aggregated.instruction,
      msg.instruction
    );
  } else {
    chunkListsWithPendingUpdates.set(key, msg);
  }
}

function applyAggregatedUpdates() {
  if (chunkListsWithPendingUpdates.size === 0) return;
  hooks.beforeRefresh();
  for (const msg of chunkListsWithPendingUpdates.values()) {
    triggerUpdate(msg);
  }
  chunkListsWithPendingUpdates.clear();
  finalizeUpdate();
}

function mergeChunkListUpdates(
  updateA: ChunkListUpdate,
  updateB: ChunkListUpdate
): ChunkListUpdate {
  let chunks;
  if (updateA.chunks != null) {
    if (updateB.chunks == null) {
      chunks = updateA.chunks;
    } else {
      chunks = mergeChunkListChunks(updateA.chunks, updateB.chunks);
    }
  } else if (updateB.chunks != null) {
    chunks = updateB.chunks;
  }

  let merged;
  if (updateA.merged != null) {
    if (updateB.merged == null) {
      merged = updateA.merged;
    } else {
      // Since `merged` is an array of updates, we need to merge them all into
      // one, consistent update.
      // Since there can only be `EcmascriptMergeUpdates` in the array, there is
      // no need to key on the `type` field.
      let update = updateA.merged[0];
      for (let i = 1; i < updateA.merged.length; i++) {
        update = mergeChunkListEcmascriptMergedUpdates(
          update,
          updateA.merged[i]
        );
      }

      for (let i = 0; i < updateB.merged.length; i++) {
        update = mergeChunkListEcmascriptMergedUpdates(
          update,
          updateB.merged[i]
        );
      }

      merged = [update];
    }
  } else if (updateB.merged != null) {
    merged = updateB.merged;
  }

  return {
    type: "ChunkListUpdate",
    chunks,
    merged,
  };
}

function mergeChunkListChunks(
  chunksA: Record<ChunkPath, ChunkUpdate>,
  chunksB: Record<ChunkPath, ChunkUpdate>
): Record<ChunkPath, ChunkUpdate> {
  const chunks: Record<ChunkPath, ChunkUpdate> = {};

  for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)) {
    const chunkUpdateB = chunksB[chunkPath];
    if (chunkUpdateB != null) {
      const mergedUpdate = mergeChunkUpdates(chunkUpdateA, chunkUpdateB);
      if (mergedUpdate != null) {
        chunks[chunkPath] = mergedUpdate;
      }
    } else {
      chunks[chunkPath] = chunkUpdateA;
    }
  }

  for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)) {
    if (chunks[chunkPath] == null) {
      chunks[chunkPath] = chunkUpdateB;
    }
  }

  return chunks;
}

function mergeChunkUpdates(
  updateA: ChunkUpdate,
  updateB: ChunkUpdate
): ChunkUpdate | undefined {
  if (
    (updateA.type === "added" && updateB.type === "deleted") ||
    (updateA.type === "deleted" && updateB.type === "added")
  ) {
    return undefined;
  }

  if (updateA.type === "partial") {
    invariant(updateA.instruction, "Partial updates are unsupported");
  }

  if (updateB.type === "partial") {
    invariant(updateB.instruction, "Partial updates are unsupported");
  }

  return undefined;
}

function mergeChunkListEcmascriptMergedUpdates(
  mergedA: EcmascriptMergedUpdate,
  mergedB: EcmascriptMergedUpdate
): EcmascriptMergedUpdate {
  const entries = mergeEcmascriptChunkEntries(mergedA.entries, mergedB.entries);
  const chunks = mergeEcmascriptChunksUpdates(mergedA.chunks, mergedB.chunks);

  return {
    type: "EcmascriptMergedUpdate",
    entries,
    chunks,
  };
}

function mergeEcmascriptChunkEntries(
  entriesA: Record<ModuleId, EcmascriptModuleEntry> | undefined,
  entriesB: Record<ModuleId, EcmascriptModuleEntry> | undefined
): Record<ModuleId, EcmascriptModuleEntry> {
  return { ...entriesA, ...entriesB };
}

function mergeEcmascriptChunksUpdates(
  chunksA: Record<ChunkPath, EcmascriptMergedChunkUpdate> | undefined,
  chunksB: Record<ChunkPath, EcmascriptMergedChunkUpdate> | undefined
): Record<ChunkPath, EcmascriptMergedChunkUpdate> | undefined {
  if (chunksA == null) {
    return chunksB;
  }

  if (chunksB == null) {
    return chunksA;
  }

  const chunks: Record<ChunkPath, EcmascriptMergedChunkUpdate> = {};

  for (const [chunkPath, chunkUpdateA] of Object.entries(chunksA)) {
    const chunkUpdateB = chunksB[chunkPath];
    if (chunkUpdateB != null) {
      const mergedUpdate = mergeEcmascriptChunkUpdates(
        chunkUpdateA,
        chunkUpdateB
      );
      if (mergedUpdate != null) {
        chunks[chunkPath] = mergedUpdate;
      }
    } else {
      chunks[chunkPath] = chunkUpdateA;
    }
  }

  for (const [chunkPath, chunkUpdateB] of Object.entries(chunksB)) {
    if (chunks[chunkPath] == null) {
      chunks[chunkPath] = chunkUpdateB;
    }
  }

  if (Object.keys(chunks).length === 0) {
    return undefined;
  }

  return chunks;
}

function mergeEcmascriptChunkUpdates(
  updateA: EcmascriptMergedChunkUpdate,
  updateB: EcmascriptMergedChunkUpdate
): EcmascriptMergedChunkUpdate | undefined {
  if (updateA.type === "added" && updateB.type === "deleted") {
    // These two completely cancel each other out.
    return undefined;
  }

  if (updateA.type === "deleted" && updateB.type === "added") {
    const added = [];
    const deleted = [];
    const deletedModules = new Set(updateA.modules ?? []);
    const addedModules = new Set(updateB.modules ?? []);

    for (const moduleId of addedModules) {
      if (!deletedModules.has(moduleId)) {
        added.push(moduleId);
      }
    }

    for (const moduleId of deletedModules) {
      if (!addedModules.has(moduleId)) {
        deleted.push(moduleId);
      }
    }

    if (added.length === 0 && deleted.length === 0) {
      return undefined;
    }

    return {
      type: "partial",
      added,
      deleted,
    };
  }

  if (updateA.type === "partial" && updateB.type === "partial") {
    const added = new Set([...(updateA.added ?? []), ...(updateB.added ?? [])]);
    const deleted = new Set([
      ...(updateA.deleted ?? []),
      ...(updateB.deleted ?? []),
    ]);

    if (updateB.added != null) {
      for (const moduleId of updateB.added) {
        deleted.delete(moduleId);
      }
    }

    if (updateB.deleted != null) {
      for (const moduleId of updateB.deleted) {
        added.delete(moduleId);
      }
    }

    return {
      type: "partial",
      added: [...added],
      deleted: [...deleted],
    };
  }

  if (updateA.type === "added" && updateB.type === "partial") {
    const modules = new Set([
      ...(updateA.modules ?? []),
      ...(updateB.added ?? []),
    ]);

    for (const moduleId of updateB.deleted ?? []) {
      modules.delete(moduleId);
    }

    return {
      type: "added",
      modules: [...modules],
    };
  }

  if (updateA.type === "partial" && updateB.type === "deleted") {
    // We could eagerly return `updateB` here, but this would potentially be
    // incorrect if `updateA` has added modules.

    const modules = new Set(updateB.modules ?? []);

    if (updateA.added != null) {
      for (const moduleId of updateA.added) {
        modules.delete(moduleId);
      }
    }

    return {
      type: "deleted",
      modules: [...modules],
    };
  }

  // Any other update combination is invalid.

  return undefined;
}

function invariant(_: never, message: string): never {
  throw new Error(`Invariant: ${message}`);
}

const CRITICAL = ["bug", "error", "fatal"];

function compareByList(list: any[], a: any, b: any) {
  const aI = list.indexOf(a) + 1 || list.length;
  const bI = list.indexOf(b) + 1 || list.length;
  return aI - bI;
}

const chunksWithIssues: Map<ResourceKey, Issue[]> = new Map();

function emitIssues() {
  const issues = [];
  const deduplicationSet = new Set();

  for (const [_, chunkIssues] of chunksWithIssues) {
    for (const chunkIssue of chunkIssues) {
      if (deduplicationSet.has(chunkIssue.formatted)) continue;

      issues.push(chunkIssue);
      deduplicationSet.add(chunkIssue.formatted);
    }
  }

  sortIssues(issues);

  hooks.issues(issues);
}

function handleIssues(msg: ServerMessage): boolean {
  const key = resourceKey(msg.resource);
  let hasCriticalIssues = false;

  for (const issue of msg.issues) {
    if (CRITICAL.includes(issue.severity)) {
      hasCriticalIssues = true;
    }
  }

  if (msg.issues.length > 0) {
    chunksWithIssues.set(key, msg.issues);
  } else if (chunksWithIssues.has(key)) {
    chunksWithIssues.delete(key);
  }

  emitIssues();

  return hasCriticalIssues;
}

const SEVERITY_ORDER = ["bug", "fatal", "error", "warning", "info", "log"];
const CATEGORY_ORDER = [
  "parse",
  "resolve",
  "code generation",
  "rendering",
  "typescript",
  "other",
];

function sortIssues(issues: Issue[]) {
  issues.sort((a, b) => {
    const first = compareByList(SEVERITY_ORDER, a.severity, b.severity);
    if (first !== 0) return first;
    return compareByList(CATEGORY_ORDER, a.category, b.category);
  });
}

const hooks = {
  beforeRefresh: () => {},
  refresh: () => {},
  buildOk: () => {},
  issues: (_issues: Issue[]) => {},
};

export function setHooks(newHooks: typeof hooks) {
  Object.assign(hooks, newHooks);
}

function handleSocketMessage(msg: ServerMessage) {
  sortIssues(msg.issues);

  handleIssues(msg);

  switch (msg.type) {
    case "issues":
      // issues are already handled
      break;
    case "partial":
      // aggregate updates
      aggregateUpdates(msg);
      break;
    default:
      // run single update
      const runHooks = chunkListsWithPendingUpdates.size === 0;
      if (runHooks) hooks.beforeRefresh();
      triggerUpdate(msg);
      if (runHooks) finalizeUpdate();
      break;
  }
}

function finalizeUpdate() {
  hooks.refresh();
  hooks.buildOk();

  // This is used by the Next.js integration test suite to notify it when HMR
  // updates have been completed.
  // TODO: Only run this in test environments (gate by `process.env.__NEXT_TEST_MODE`)
  if (globalThis.__NEXT_HMR_CB) {
    globalThis.__NEXT_HMR_CB();
    globalThis.__NEXT_HMR_CB = null;
  }
}

function subscribeToChunkUpdate(
  chunkPath: ChunkPath,
  sendMessage: SendMessage,
  callback: UpdateCallback
): () => void {
  return subscribeToUpdate(
    {
      path: chunkPath,
    },
    sendMessage,
    callback
  );
}

export function subscribeToUpdate(
  resource: ResourceIdentifier,
  sendMessage: SendMessage,
  callback: UpdateCallback
) {
  const key = resourceKey(resource);
  let callbackSet: UpdateCallbackSet;
  const existingCallbackSet = updateCallbackSets.get(key);
  if (!existingCallbackSet) {
    callbackSet = {
      callbacks: new Set([callback]),
      unsubscribe: subscribeToUpdates(sendMessage, resource),
    };
    updateCallbackSets.set(key, callbackSet);
  } else {
    existingCallbackSet.callbacks.add(callback);
    callbackSet = existingCallbackSet;
  }

  return () => {
    callbackSet.callbacks.delete(callback);

    if (callbackSet.callbacks.size === 0) {
      callbackSet.unsubscribe();
      updateCallbackSets.delete(key);
    }
  };
}

function triggerUpdate(msg: ServerMessage) {
  const key = resourceKey(msg.resource);
  const callbackSet = updateCallbackSets.get(key);
  if (!callbackSet) {
    return;
  }

  for (const callback of callbackSet.callbacks) {
    callback(msg);
  }

  if (msg.type === "notFound") {
    // This indicates that the resource which we subscribed to either does not exist or
    // has been deleted. In either case, we should clear all update callbacks, so if a
    // new subscription is created for the same resource, it will send a new "subscribe"
    // message to the server.
    // No need to send an "unsubscribe" message to the server, it will have already
    // dropped the update stream before sending the "notFound" message.
    updateCallbackSets.delete(key);
  }
}
