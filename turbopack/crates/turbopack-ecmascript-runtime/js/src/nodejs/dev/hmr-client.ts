/// <reference path="../../shared/runtime/dev-protocol.d.ts" />
/// <reference path="../../shared/runtime/hmr-runtime.ts" />

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Node.js HMR client implementation.
 * Simplified for concatenated runtime - no ESM imports.
 */

// Node.js HMR payload with direct EcmascriptMergedUpdate (no ChunkListUpdate wrapper)
type NodeJsHmrPayload = {
  resource: {
    path: string
    headers?: Record<string, string>
  }
  issues: Issue[]
  type: 'partial'
  instruction: EcmascriptMergedUpdate
}

/**
 * Emits an HMR message to registered update listeners.
 * In Node.js, we directly invoke the listeners rather than going through
 * a full message backend like the browser does.
 */
function emitMessage(msg: { type: string; data: any }): void {
  // Find and invoke listeners registered in TURBOPACK_CHUNK_UPDATE_LISTENERS
  if (globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS) {
    for (const [
      _chunkPath,
      listener,
    ] of globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS) {
      try {
        listener(msg.data)
      } catch (err) {
        console.error('[Server HMR] Listener error:', err)
      }
    }
  }
}

/**
 * Handles server message updates and applies them to the Node.js runtime.
 * Uses shared HMR update logic from hmr-runtime.ts.
 */
function handleNodejsUpdate(
  msg: NodeJsHmrPayload,
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>,
  runtimeModules: Set<ModuleId>,
  instantiateModuleFn: (
    moduleId: ModuleId,
    sourceType: SourceType,
    sourceData: SourceData
  ) => HotModule
): void {
  if (msg.type !== 'partial') {
    return
  }

  const instruction = msg.instruction
  if (instruction.type !== 'EcmascriptMergedUpdate') {
    return
  }

  try {
    const { entries = {}, chunks = {} } = instruction

    // Node.js eval function (no source maps)
    const evalModuleEntry = (entry: EcmascriptModuleEntry) => {
      // eslint-disable-next-line no-eval
      return (0, eval)(entry.code)
    }

    // Node.js doesn't use applyModuleFactoryName (no-op)
    const applyModuleFactoryName = (_factory: ModuleFactory) => {}

    // Compute changed modules (Node.js has no chunk management, so pass undefined)
    const { added, modified } = computeChangedModules(
      entries,
      chunks,
      undefined // no chunkModulesMap for Node.js
    )

    // Use shared HMR update implementation
    applyEcmascriptMergedUpdateShared(
      added,
      modified,
      new Set(), // no disposedModules for Node.js (no chunk management)
      evalModuleEntry,
      instantiateModuleFn,
      applyModuleFactoryName,
      moduleFactories,
      devModuleCache,
      runtimeModules
    )
  } catch (e) {
    console.error('[Server HMR] Update failed, full reload needed:', e)
    throw e
  }
}

let initialized = false

function initializeServerHmr(
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>,
  runtimeModules: Set<ModuleId>,
  instantiateModuleFn: (
    moduleId: ModuleId,
    sourceType: SourceType,
    sourceData: SourceData
  ) => HotModule
): void {
  if (initialized) {
    return
  }

  initialized = true

  const queued = globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS
  if (queued != null && !Array.isArray(queued)) {
    throw new Error('A separate HMR handler was already registered')
  }

  if (!Array.isArray(globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS)) {
    globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS = []
  }

  // Register an update callback for the server runtime
  // The chunk path doesn't matter much for Node.js server since we get updates
  // directly, but we use '__server__' as a placeholder
  const serverChunkPath = '__server__' as ChunkListPath
  globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS.push([
    serverChunkPath,
    (msg: NodeJsHmrPayload) => {
      handleNodejsUpdate(
        msg,
        moduleFactories,
        devModuleCache,
        runtimeModules,
        instantiateModuleFn
      )
    },
  ])
}
