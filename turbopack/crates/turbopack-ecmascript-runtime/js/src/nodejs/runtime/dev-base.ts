/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="./runtime-base.ts" />
/// <reference path="../../shared/runtime/dev-extensions.ts" />
/// <reference path="../../shared/runtime/hmr-runtime.ts" />

/**
 * Development Node.js runtime.
 * Uses HotModule and shared HMR logic for hot module replacement support.
 */

// Cast the module cache to HotModule for development mode
// (hmr-runtime.ts declares devModuleCache as `let` variable expecting assignment)
// This is safe because HotModule extends Module
devModuleCache = moduleCache as ModuleCache<HotModule>

// this is read in runtime-utils.ts so it creates a module with direction for hmr
createModuleWithDirectionFlag = true

if (!globalThis.__turbopack_runtime_modules__) {
  globalThis.__turbopack_runtime_modules__ = new Set()
}
runtimeModules = globalThis.__turbopack_runtime_modules__

interface TurbopackNodeDevBuildContext extends TurbopackBaseContext<HotModule> {
  R: ResolvePathFromModule
  x: ExternalRequire
  y: ExternalImport
  C: typeof clearChunkCache
}

const nodeDevContextPrototype =
  Context.prototype as TurbopackNodeDevBuildContext

nodeDevContextPrototype.q = exportUrl
nodeDevContextPrototype.M = moduleFactories
nodeDevContextPrototype.c = devModuleCache
nodeDevContextPrototype.R = resolvePathFromModule
nodeDevContextPrototype.C = clearChunkCache

if (globalThis.__turbopack_ensure_chunk__ !== undefined) {
  const chunksBeingEnsured = new Map<ChunkPath, Promise<void>>()

  function loadChunkAsyncOnDemand<TModule extends Module>(
    this: TurbopackBaseContext<TModule>,
    chunkData: ChunkData
  ): Promise<void> {
    const chunkPath = typeof chunkData === 'string' ? chunkData : chunkData.path
    const ensureChunk = globalThis.__turbopack_ensure_chunk__
    if (ensureChunk === undefined || chunkCache.has(chunkPath)) {
      return loadChunkAsync.call(this, chunkData)
    }

    const ensured =
      chunksBeingEnsured.get(chunkPath) ??
      Promise.resolve()
        .then(() => ensureChunk(chunkPath))
        .finally(() => chunksBeingEnsured.delete(chunkPath))
    chunksBeingEnsured.set(chunkPath, ensured)

    return ensured.then(() => loadChunkAsync.call(this, chunkData))
  }
  nodeDevContextPrototype.l = loadChunkAsyncOnDemand
}

// Node.js: no hooks wrapper, just execute directly
const runWithHooks = (
  module: HotModule,
  exports: Exports,
  factory: Function
) => {
  factory.call(
    exports,
    new (Context as any as ContextConstructor<HotModule>)(module, exports),
    module,
    exports
  )
}

/**
 * Instantiates a module in development mode using shared HMR logic.
 */
function instantiateModule(
  id: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): HotModule {
  // Use shared instantiation logic (includes hot API setup)
  const newModule = instantiateModuleShared(
    id,
    sourceType,
    sourceData,
    createModuleWithDirection,
    runWithHooks
  )

  // Node.js-specific: mark module as loaded
  ;(newModule as any).loaded = true

  return newModule
}

/**
 * Instantiates a runtime module in development mode.
 */
function instantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): HotModule {
  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}

/**
 * Retrieves a module from the cache, or instantiate it as a runtime module if it is not cached.
 */
// @ts-ignore TypeScript doesn't separate this module space from the browser runtime
function getOrInstantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): HotModule {
  return (
    getCachedModule(devModuleCache, moduleId) ??
    instantiateRuntimeModule(chunkPath, moduleId)
  )
}

/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 * Also tracks parent-child relationships for HMR dependency tracking.
 */
// @ts-ignore
function getOrInstantiateModuleFromParent(
  id: ModuleId,
  sourceModule: HotModule
): HotModule {
  // Track parent-child relationship, even when the cached module errored
  trackModuleImport(sourceModule, id, devModuleCache.get(id))

  const module = getCachedModule(devModuleCache, id)
  if (module) {
    return module
  }

  const newModule = instantiateModule(id, SourceType.Parent, sourceModule.id)

  // Track again after instantiation to ensure the relationship is recorded
  trackModuleImport(sourceModule, id, newModule)

  return newModule
}

module.exports = (sourcePath: ChunkPath) => ({
  m: (id: ModuleId) => getOrInstantiateRuntimeModule(sourcePath, id),
  c: (chunkData: ChunkData) => loadRuntimeChunk(sourcePath, chunkData),
})
