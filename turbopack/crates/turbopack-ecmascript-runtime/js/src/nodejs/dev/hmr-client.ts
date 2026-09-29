/// <reference path="../../shared/runtime/dev-protocol.d.ts" />
/// <reference path="../../shared/runtime/hmr-runtime.ts" />

/* eslint-disable @typescript-eslint/no-unused-vars */

type NodeJsHmrPayload = {
  resource: {
    path: string
    headers?: Record<string, string>
  }
  issues: Issue[]
  type: 'partial'
  instruction: NodeJsEcmascriptMergedUpdate | NodeJsChunkListUpdate
}

/**
 * Appends the module code with //# sourceURL and //# sourceMappingURL so
 * that Node.js can resolve stack frames from `eval`ed server HMR modules back to
 * their original source files. Mirrors the browser's _eval in dev-backend-dom.ts.
 */
function inlineSourcemaps(entry: EcmascriptModuleEntry): string {
  const [chunkPath, moduleId] = entry.url.split('?', 2)
  const absolutePath = path.resolve(RUNTIME_ROOT, chunkPath)
  const fileHref = url.pathToFileURL(absolutePath).href
  const sourceURL = moduleId ? `${fileHref}?${moduleId}` : fileHref
  let code = entry.code + '\n\n//# sourceURL=' + sourceURL
  if (entry.map) {
    code +=
      '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
      Buffer.from(entry.map).toString('base64')
  }
  return code
}

let serverHmrUpdateHandler: ((msg: NodeJsHmrPayload) => void) | null = null

function initializeServerHmr(
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>
): void {
  if (serverHmrUpdateHandler != null) {
    throw new Error('[Server HMR] Server HMR client is already initialized')
  }

  // Register the update handler for the server runtime
  serverHmrUpdateHandler = (msg: NodeJsHmrPayload) => {
    handleNodejsUpdate(msg, moduleFactories, devModuleCache)
  }
}

/**
 * Emits an HMR message to the registered update handler.
 * Node uses a simpler listener pattern than the browser's websocket connection.
 *
 * Note: This is only called via __turbopack_server_hmr_apply__ which ensures
 * the handler is initialized first via ensureHmrClientInitialized().
 */
function emitMessage(msg: { type: string; data: any }): void {
  if (serverHmrUpdateHandler == null) {
    throw new Error(
      '[Server HMR] No update handler registered to receive message'
    )
  }

  serverHmrUpdateHandler(msg.data)
}

/**
 * Handles server message updates and applies them to the Node.js runtime.
 * Uses shared HMR update logic from hmr-runtime.ts.
 */
function handleNodejsUpdate(
  msg: NodeJsHmrPayload,
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>
): void {
  if (msg.type !== 'partial') {
    return
  }

  const instruction = msg.instruction

  try {
    if (instruction.type === 'ChunkListUpdate') {
      // All node ecmascript chunks are mergeable, so a `total`/`partial` here
      // means a non-mergeable asset changed in an unsupported way. Escalate
      // to a full clear() rather than leave stale factories in memory.
      for (const [chunkPath, chunkUpdate] of Object.entries(
        instruction.chunks ?? {}
      )) {
        if (chunkUpdate.type === 'total' || chunkUpdate.type === 'partial') {
          throw new Error(
            `unsupported '${chunkUpdate.type}' update for chunk ${chunkPath}`
          )
        }
      }

      if (instruction.merged) {
        for (const merged of instruction.merged) {
          applyEcmascriptMergedUpdate(merged, moduleFactories, devModuleCache)
        }
      }
      return
    }

    if (instruction.type === 'EcmascriptMergedUpdate') {
      applyEcmascriptMergedUpdate(instruction, moduleFactories, devModuleCache)
      return
    }
  } catch (e) {
    console.error('[Server HMR] Update failed, full reload needed:', e)
    throw e
  }
}

function applyEcmascriptMergedUpdate(
  instruction: NodeJsEcmascriptMergedUpdate,
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>
): void {
  const { entries = {}, chunks = {} } = instruction

  const evalModuleEntry = (entry: EcmascriptModuleEntry) => {
    const code = entry.map ? inlineSourcemaps(entry) : entry.code
    // eslint-disable-next-line no-eval
    return (0, eval)(`(require) => ${code}`)(require)
  }

  const { added, modified } = computeChangedModules(
    entries,
    chunks,
    undefined // no chunkModulesMap for Node.js
  )

  // Modules that appear in an "added" chunk but already exist in the cache
  // were moved to a renamed chunk. Treat them as modified so the dependency
  // walk runs and they get re-instantiated with the new factory.
  for (const [moduleId, entry] of added) {
    if (entry != null && devModuleCache[moduleId] != null) {
      added.delete(moduleId)
      modified.set(moduleId, entry)
    }
  }

  // Use shared HMR update implementation
  applyEcmascriptMergedUpdateShared({
    added,
    modified,
    disposedModules: [], // no disposedModules for Node.js (no chunk management)
    evalModuleEntry,
    instantiateModule,
    applyModuleFactoryName: () => {}, // Node doesn't use this
    moduleFactories,
    devModuleCache,
    autoAcceptRootModules: true,
  })
}
