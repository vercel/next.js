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

// Turbopack may produce multiple server runtime instances in the same Node.js
// process (e.g. one under server/chunks/ssr/ for pages and one under
// server/chunks/ for metadata routes). Each runtime runs this file exactly
// once (Node.js require cache per absolute path), so each produces its own
// __turbopack_server_hmr_apply__ closure that binds to its own moduleFactories
// and devModuleCache.
//
// To ensure all runtime instances receive HMR updates, we maintain a shared
// registry array on globalThis. The first runtime to register in each
// "generation" (i.e. after the hot-reloader resets the array to []) also
// installs a multicast dispatcher as the authoritative
// globalThis.__turbopack_server_hmr_apply__. Every runtime (including the
// first) pushes its own per-runtime handler into the registry.
//
// The hot-reloader resets __turbopack_server_hmr_handlers__ to [] on full
// cache reset so stale handlers from evicted chunks don't accumulate.
const _handlers: Array<(update: NodeJsHmrPayload) => boolean> =
  globalThis.__turbopack_server_hmr_handlers__ ?? []

if (_handlers.length === 0) {
  // First registration in this generation: install the multicast dispatcher.
  globalThis.__turbopack_server_hmr_apply__ = (
    update: NodeJsHmrPayload
  ): boolean => {
    const fns = globalThis.__turbopack_server_hmr_handlers__
    if (!fns || fns.length === 0) return false
    let applied = false
    for (const fn of fns) {
      try {
        if (fn(update)) applied = true
      } catch (err) {
        console.error('[Server HMR] Handler error:', err)
      }
    }
    return applied
  }
}

globalThis.__turbopack_server_hmr_handlers__ = _handlers
_handlers.push(__turbopack_server_hmr_apply__)
