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

function __turbopack_server_hmr_apply__(update: NodeJsHmrPayload): void {
  ensureHmrClientInitialized()
  // Throws if the update can't be applied in-process; the consumer catches it
  // and falls back to evicting require.cache.
  emitMessage({
    type: 'turbopack-message',
    data: update,
  })
}

// Turbopack produces one server runtime per chunking context (e.g.
// server/chunks/ssr/ for pages, server/chunks/ for route handlers), each with
// its own moduleFactories. We keep a globalThis Map from __filename to handler
// so updates are routed only to runtimes whose chunkPrefix matches the update's
// chunk paths, skipping unnecessary eval() calls. Map.set() naturally replaces
// stale entries when a runtime file is re-evaluated after require.cache eviction.

type HmrHandlerEntry = {
  handler: (update: NodeJsHmrPayload) => void
  /** Clear the chunk-loading cache owned by this runtime. */
  clearChunkCache: () => void
  /** Absolute output root for the Next.js project which owns this runtime. */
  runtimeRoot: string
  /** Output directory relative to RUNTIME_ROOT, e.g. "server/chunks/ssr". */
  chunkPrefix: string
}

const handlers: Map<string, HmrHandlerEntry> =
  globalThis.__turbopack_server_hmr_handlers__ ?? new Map()

// Normalize to forward slashes so it matches the virtual chunk paths in
// `update.instruction.chunks`, which always use `/` regardless of OS.
const chunkPrefix = path
  .relative(RUNTIME_ROOT, path.dirname(__filename))
  .replaceAll(path.sep, '/')
const runtimeRoot = path.resolve(RUNTIME_ROOT)

if (handlers.size === 0) {
  // First registration in this generation: install the routing dispatcher.
  globalThis.__turbopack_server_hmr_apply__ = (
    targetRuntimeRoot: string,
    update: NodeJsHmrPayload
  ): void => {
    const registry: Map<string, HmrHandlerEntry> =
      globalThis.__turbopack_server_hmr_handlers__ ?? new Map()

    // Chunk paths can appear either directly on the instruction (single-chunk
    // updates) or nested inside `merged` entries (chunks covered by a
    // merger). Collect both so routing isn't skipped just because a mergeable
    // chunk's update only reports its paths inside `merged`.
    const updateChunkPaths = new Set<string>([
      ...Object.keys(update.instruction?.chunks ?? {}),
      ...(update.instruction?.merged ?? []).flatMap((merged) =>
        Object.keys(merged.chunks ?? {})
      ),
    ])

    const toCall: HmrHandlerEntry[] = []
    if (updateChunkPaths.size === 0) {
      for (const entry of registry.values()) {
        if (entry.runtimeRoot === targetRuntimeRoot) toCall.push(entry)
      }
    } else {
      const seen = new Set<string>()
      for (const chunkPath of updateChunkPaths) {
        const dir = path.dirname(chunkPath)
        for (const [key, entry] of registry) {
          if (
            entry.runtimeRoot === targetRuntimeRoot &&
            dir === entry.chunkPrefix &&
            !seen.has(key)
          ) {
            seen.add(key)
            toCall.push(entry)
          }
        }
      }
    }

    // No matching runtime loaded (e.g. editing a route not required yet this
    // session): nothing live to patch, so this is a no-op. A handler that
    // throws propagates to the consumer, which evicts require.cache.
    for (const { handler } of toCall) {
      handler(update)
    }
  }
}

globalThis.__turbopack_server_hmr_handlers__ = handlers

handlers.set(__filename, {
  handler: __turbopack_server_hmr_apply__,
  clearChunkCache,
  runtimeRoot,
  chunkPrefix,
})
