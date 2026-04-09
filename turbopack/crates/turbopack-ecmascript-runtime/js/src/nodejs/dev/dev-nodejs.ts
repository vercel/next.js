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

// Turbopack produces one server runtime per chunking context (e.g.
// server/chunks/ssr/ for pages, server/chunks/ for route handlers), each with
// its own moduleFactories. We keep a globalThis Map from __filename to handler
// so updates are routed only to runtimes whose chunkPrefix matches the update's
// chunk paths, skipping unnecessary eval() calls. Map.set() naturally replaces
// stale entries when a runtime file is re-evaluated after require.cache eviction.

type HmrHandlerEntry = {
  handler: (update: NodeJsHmrPayload) => boolean
  /** Output directory relative to RUNTIME_ROOT, e.g. "server/chunks/ssr". */
  chunkPrefix: string
}

const handlers: Map<string, HmrHandlerEntry> =
  globalThis.__turbopack_server_hmr_handlers__ ?? new Map()

const chunkPrefix = path.relative(RUNTIME_ROOT, path.dirname(__filename))

if (handlers.size === 0) {
  // First registration in this generation: install the routing dispatcher.
  globalThis.__turbopack_server_hmr_apply__ = (
    update: NodeJsHmrPayload
  ): boolean => {
    const registry: Map<string, HmrHandlerEntry> =
      globalThis.__turbopack_server_hmr_handlers__ ?? new Map()
    const updateChunkPaths = Object.keys(update.instruction?.chunks ?? {})

    const toCall: HmrHandlerEntry[] = []
    if (updateChunkPaths.length === 0) {
      for (const entry of registry.values()) toCall.push(entry)
    } else {
      const seen = new Set<string>()
      for (const chunkPath of updateChunkPaths) {
        const dir = path.dirname(chunkPath)
        for (const [key, entry] of registry) {
          if (dir === entry.chunkPrefix && !seen.has(key)) {
            seen.add(key)
            toCall.push(entry)
          }
        }
      }
    }

    let applied = false
    for (const { handler } of toCall) {
      try {
        if (handler(update)) applied = true
      } catch (err) {
        console.error('[Server HMR] Handler error:', err)
      }
    }

    return applied
  }
}

globalThis.__turbopack_server_hmr_handlers__ = handlers

handlers.set(__filename, {
  handler: __turbopack_server_hmr_apply__,
  chunkPrefix,
})
