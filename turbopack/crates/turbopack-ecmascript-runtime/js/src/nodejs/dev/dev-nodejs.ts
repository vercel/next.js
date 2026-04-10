/// <reference path="../../shared/runtime/dev-protocol.d.ts" />
/// <reference path="./hmr-client.ts" />

/**
 * Note: hmr-runtime.ts is embedded before this file, so its functions
 * (initializeServerHmr, emitMessage) are available in the same scope.
 */

// Initialize server HMR client (connects to shared HMR infrastructure)
let hmrClientInitialized = false
function ensureHmrClientInitialized() {
  if (hmrClientInitialized) return
  hmrClientInitialized = true

  // initializeServerHmr is from hmr-client.ts (embedded before this file)
  // moduleFactories is from dev-runtime.ts
  // devModuleCache is the HotModule-typed cache from dev-runtime.ts
  initializeServerHmr(moduleFactories, devModuleCache)
}

function __turbopack_server_hmr_apply__(update: NodeJsHmrPayload): boolean {
  try {
    ensureHmrClientInitialized()

    // emitMessage returns false if any listener failed to apply the update
    return emitMessage({
      type: 'turbopack-message',
      data: update,
    })
  } catch (err) {
    console.error('[Server HMR] Failed to apply update:', err)
    return false
  }
}

// All Node.js server endpoints share a single chunking context and therefore a
// single runtime file — install the handler directly on globalThis. When the
// runtime is re-evaluated after require.cache eviction, the assignment simply
// reinstalls the fresh handler.
globalThis.__turbopack_server_hmr_apply__ = __turbopack_server_hmr_apply__
