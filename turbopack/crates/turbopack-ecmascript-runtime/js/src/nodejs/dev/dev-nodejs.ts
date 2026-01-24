/// <reference path="../../shared/runtime/dev-globals.d.ts" />
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
  // moduleFactories, runtimeModules, and instantiateModule are from dev-runtime.ts
  // devModuleCache is the HotModule-typed cache from dev-runtime.ts
  initializeServerHmr(
    moduleFactories,
    devModuleCache,
    runtimeModules,
    instantiateModule
  )
}

function __turbopack_server_hmr_apply__(update: NodeJsHmrPayload): boolean {
  try {
    // Initialize HMR client on first update
    ensureHmrClientInitialized()

    // emitMessage is from hmr-client.ts (embedded before this file)
    emitMessage({
      type: 'turbopack-message',
      data: update,
    })

    return true
  } catch (err) {
    console.error('[Server HMR] Failed to apply update:', err)
    return false
  }
}

;(globalThis as any).__turbopack_server_hmr_apply__ =
  __turbopack_server_hmr_apply__
;(globalThis as any).__turbopack__server_hmr_apply__ =
  __turbopack_server_hmr_apply__
