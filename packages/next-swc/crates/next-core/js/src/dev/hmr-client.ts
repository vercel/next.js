import type {
  ClientMessage,
  EcmascriptChunkUpdate,
  Issue,
  ServerMessage,
} from "@vercel/turbopack-runtime/types/protocol";
import type {
  ChunkPath,
  ChunkUpdateCallback,
  TurbopackGlobals,
} from "@vercel/turbopack-runtime/types";

import stripAnsi from "@vercel/turbopack-next/compiled/strip-ansi";

import { onBuildOk, onRefresh, onTurbopackError } from "../overlay/client";
import { addEventListener, sendMessage } from "./websocket";
import { ModuleId } from "@vercel/turbopack-runtime/types";
import { HmrUpdateEntry } from "@vercel/turbopack-runtime/types/protocol";

declare var globalThis: TurbopackGlobals;

export type ClientOptions = {
  assetPrefix: string;
};

export function connect({ assetPrefix }: ClientOptions) {
  addEventListener((event) => {
    switch (event.type) {
      case "connected":
        handleSocketConnected();
        break;
      case "message":
        const msg: ServerMessage = JSON.parse(event.message.data);
        handleSocketMessage(msg);
        break;
    }
  });

  const queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS;
  if (queued != null && !Array.isArray(queued)) {
    throw new Error("A separate HMR handler was already registered");
  }
  globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = {
    push: ([chunkPath, callback]: [ChunkPath, ChunkUpdateCallback]) => {
      onChunkUpdate(chunkPath, callback);
    },
  };

  if (Array.isArray(queued)) {
    for (const [chunkPath, callback] of queued) {
      onChunkUpdate(chunkPath, callback);
    }
  }

  subscribeToInitialCssChunksUpdates(assetPrefix);
}

const chunkUpdateCallbacks: Map<ChunkPath, ChunkUpdateCallback[]> = new Map();

function sendJSON(message: ClientMessage) {
  sendMessage(JSON.stringify(message));
}

function subscribeToChunkUpdates(chunkPath: ChunkPath) {
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

type AggregatedUpdates = {
  added: Record<ModuleId, HmrUpdateEntry>;
  modified: Record<ModuleId, HmrUpdateEntry>;
  deleted: Set<ModuleId>;
};

// we aggregate all updates until the issues are resolved
const chunksWithErrors: Map<ChunkPath, AggregatedUpdates> = new Map();

function aggregateUpdates(
  msg: ServerMessage,
  hasErrors: boolean
): ServerMessage {
  const aggregated = chunksWithErrors.get(msg.chunkPath);

  if (msg.type === "issues" && aggregated != null) {
    if (!hasErrors) {
      chunksWithErrors.delete(msg.chunkPath);
    }

    return {
      ...msg,
      type: "partial",
      instruction: {
        type: "EcmascriptChunkUpdate",
        added: aggregated.added,
        modified: aggregated.modified,
        deleted: Array.from(aggregated.deleted),
      },
    };
  }

  if (msg.type !== "partial") return msg;

  if (aggregated == null) {
    if (hasErrors) {
      chunksWithErrors.set(msg.chunkPath, {
        added: msg.instruction.added,
        modified: msg.instruction.modified,
        deleted: new Set(msg.instruction.deleted),
      });
    }

    return msg;
  }

  for (const [moduleId, entry] of Object.entries(msg.instruction.added)) {
    const removedDeleted = aggregated.deleted.delete(moduleId);
    if (aggregated.modified[moduleId] != null) {
      console.error(
        `impossible state aggregating updates: module "${moduleId}" was added, but previously modified`
      );
      location.reload();
    }

    if (removedDeleted) {
      aggregated.modified[moduleId] = entry;
    } else {
      aggregated.added[moduleId] = entry;
    }
  }

  for (const [moduleId, entry] of Object.entries(msg.instruction.modified)) {
    if (aggregated.added[moduleId] != null) {
      aggregated.added[moduleId] = entry;
    } else {
      aggregated.modified[moduleId] = entry;
    }

    if (aggregated.deleted.has(moduleId)) {
      console.error(
        `impossible state aggregating updates: module "${moduleId}" was modified, but previously deleted`
      );
      location.reload();
    }
  }

  for (const moduleId of msg.instruction.deleted) {
    delete aggregated.added[moduleId];
    delete aggregated.modified[moduleId];
    aggregated.deleted.add(moduleId);
  }

  if (!hasErrors) {
    chunksWithErrors.delete(msg.chunkPath);
  } else {
    chunksWithErrors.set(msg.chunkPath, aggregated);
  }

  return {
    ...msg,
    instruction: {
      type: "EcmascriptChunkUpdate",
      added: aggregated.added,
      modified: aggregated.modified,
      deleted: Array.from(aggregated.deleted),
    },
  };
}

function handleIssues(msg: ServerMessage): boolean {
  let issueToReport = null;

  for (const issue of msg.issues) {
    if (["bug", "error", "fatal"].includes(issue.severity)) {
      issueToReport = issue;
      break;
    }
  }

  if (issueToReport) {
    console.error(stripAnsi(issueToReport.formatted));
    onTurbopackError(issueToReport);
  }

  return issueToReport != null;
}

function handleSocketMessage(msg: ServerMessage) {
  const hasErrors = handleIssues(msg);
  const aggregatedMsg = aggregateUpdates(msg, hasErrors);
  console.dir(aggregatedMsg);

  if (hasErrors) return;

  if (chunksWithErrors.size === 0) {
    onBuildOk();
  }

  if (aggregatedMsg.type !== "issues") {
    triggerChunkUpdate(aggregatedMsg);
    if (chunksWithErrors.size === 0) {
      onRefresh();
    }
  }
}

export function onChunkUpdate(
  chunkPath: ChunkPath,
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
function subscribeToInitialCssChunksUpdates(assetPrefix: string) {
  const initialCssChunkLinks: NodeListOf<HTMLLinkElement> =
    document.head.querySelectorAll("link");
  const cssChunkPrefix = `${assetPrefix}/`;
  initialCssChunkLinks.forEach((link) => {
    const href = link.href;
    if (href == null) {
      return;
    }
    const { pathname, origin } = new URL(href);
    if (origin !== location.origin || !pathname.startsWith(cssChunkPrefix)) {
      return;
    }

    const chunkPath = pathname.slice(cssChunkPrefix.length);
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
