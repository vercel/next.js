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

type HmrRefreshOwners =
  | { type: 'unrelated' }
  | { type: 'all' }
  | { type: 'owners'; owners: string[] }

const appRscModulePrefix = '[project]/'
const appRscModuleSuffix = ' [app-rsc] (ecmascript)'
const appPageEntryModuleIdRegex =
  /\/node_modules\/next\/dist\/esm\/build\/templates\/app-page\.js\?page=/

function getAppRscModulePath(moduleId: string): string | null {
  if (
    !moduleId.startsWith(appRscModulePrefix) ||
    !moduleId.endsWith(appRscModuleSuffix)
  ) {
    return null
  }
  return moduleId.slice(appRscModulePrefix.length, -appRscModuleSuffix.length)
}

function isHmrRefreshOwnerPath(modulePath: string): boolean {
  const filename = modulePath.slice(modulePath.lastIndexOf('/') + 1)
  return /^(?:page|layout|default)\.[^/]+$/.test(filename)
}

function getHmrRefreshOwners(moduleIds: string[]): HmrRefreshOwners {
  const owners = new Set<string>()
  let foundAppRscModule = false
  let complete = true

  for (const moduleId of moduleIds) {
    if (getAppRscModulePath(moduleId) === null || !devModuleCache[moduleId]) {
      continue
    }

    foundAppRscModule = true
    let foundOwner = false
    const visited = new Set<ModuleId>()
    const pending: ModuleId[] = [moduleId]

    while (pending.length > 0) {
      const currentId = pending.pop()!
      if (visited.has(currentId)) {
        continue
      }
      visited.add(currentId)

      if (typeof currentId === 'string') {
        const modulePath = getAppRscModulePath(currentId)
        if (modulePath !== null && isHmrRefreshOwnerPath(modulePath)) {
          owners.add(modulePath)
          foundOwner = true
          continue
        }
      }

      const module = devModuleCache[currentId]
      if (module === undefined || module.parents.length === 0) {
        if (
          typeof currentId !== 'string' ||
          !appPageEntryModuleIdRegex.test(currentId)
        ) {
          complete = false
        }
        continue
      }
      pending.push(...module.parents)
    }

    if (!foundOwner) {
      complete = false
    }
  }

  if (!foundAppRscModule) {
    return { type: 'unrelated' }
  }
  if (!complete || owners.size === 0) {
    return { type: 'all' }
  }
  return { type: 'owners', owners: [...owners] }
}

// Turbopack produces one server runtime per chunking context (e.g.
// server/chunks/ssr/ for pages, server/chunks/ for route handlers), each with
// its own moduleFactories. We keep a globalThis Map from __filename to handler
// so updates are routed only to runtimes whose chunkPrefix matches the update's
// chunk paths, skipping unnecessary eval() calls. Map.set() naturally replaces
// stale entries when a runtime file is re-evaluated after require.cache eviction.

type HmrHandlerEntry = {
  handler: (update: NodeJsHmrPayload) => boolean
  getRefreshOwners: (moduleIds: string[]) => HmrRefreshOwners
  /** Output directory relative to RUNTIME_ROOT, e.g. "server/chunks/ssr". */
  chunkPrefix: string
}

const handlers: Map<string, HmrHandlerEntry> =
  globalThis.__turbopack_server_hmr_handlers__ ?? new Map()

const chunkPrefix = path.relative(RUNTIME_ROOT, path.dirname(__filename))

function getMatchingHandlers(
  update: NodeJsHmrPayload,
  registry: Map<string, HmrHandlerEntry>
): HmrHandlerEntry[] {
  const updateChunkPaths = Object.keys(update.instruction?.chunks ?? {})
  if (updateChunkPaths.length === 0) {
    return [...registry.values()]
  }

  const result: HmrHandlerEntry[] = []
  const seen = new Set<string>()
  for (const chunkPath of updateChunkPaths) {
    const dir = path.dirname(chunkPath)
    for (const [key, entry] of registry) {
      if (dir === entry.chunkPrefix && !seen.has(key)) {
        seen.add(key)
        result.push(entry)
      }
    }
  }
  return result
}

if (handlers.size === 0) {
  // First registration in this generation: install the routing dispatcher.
  globalThis.__turbopack_server_hmr_apply__ = (
    update: NodeJsHmrPayload
  ): boolean => {
    const registry: Map<string, HmrHandlerEntry> =
      globalThis.__turbopack_server_hmr_handlers__ ?? new Map()

    let applied = false
    for (const { handler } of getMatchingHandlers(update, registry)) {
      try {
        if (handler(update)) applied = true
      } catch (err) {
        console.error('[Server HMR] Handler error:', err)
      }
    }

    return applied
  }

  globalThis.__turbopack_server_hmr_get_refresh_owners__ = (
    update: NodeJsHmrPayload
  ): HmrRefreshOwners => {
    const registry: Map<string, HmrHandlerEntry> =
      globalThis.__turbopack_server_hmr_handlers__ ?? new Map()
    const moduleIds = Object.keys(update.instruction?.entries ?? {})
    const owners = new Set<string>()
    let foundOwners = false

    for (const entry of getMatchingHandlers(update, registry)) {
      const result = entry.getRefreshOwners(moduleIds)
      switch (result.type) {
        case 'unrelated':
          break
        case 'all':
          return result
        case 'owners':
          foundOwners = true
          for (const owner of result.owners) {
            owners.add(owner)
          }
          break
        default:
          result satisfies never
      }
    }

    return foundOwners
      ? { type: 'owners', owners: [...owners] }
      : { type: 'unrelated' }
  }
}

globalThis.__turbopack_server_hmr_handlers__ = handlers

handlers.set(__filename, {
  handler: __turbopack_server_hmr_apply__,
  getRefreshOwners: getHmrRefreshOwners,
  chunkPrefix,
})
