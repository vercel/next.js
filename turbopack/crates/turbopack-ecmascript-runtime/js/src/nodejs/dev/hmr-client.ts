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
  instruction: EcmascriptMergedUpdate
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
function emitMessage(msg: { type: string; data: any }): boolean {
  if (serverHmrUpdateHandler == null) {
    console.warn(
      '[Server HMR] No update handler registered to receive message:',
      msg
    )
    return false
  }

  try {
    serverHmrUpdateHandler(msg.data)
    return true
  } catch (err) {
    console.error('[Server HMR] Listener error:', err)
    return false
  }
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

    const { added, modified } = computeChangedModules(
      entries,
      chunks,
      undefined // no chunkModulesMap for Node.js
    )

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
  } catch (e) {
    console.error('[Server HMR] Update failed, full reload needed:', e)
    throw e
  }
}
