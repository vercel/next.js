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
nodeDevContextPrototype.b = createWorker
nodeDevContextPrototype.C = clearChunkCache

/**
 * Instantiates a module in development mode using shared HMR logic.
 */
function instantiateModule(
  id: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): HotModule {
  // Node.js: creates base module object (hot API added by shared code)
  const createModuleObjectFn = (moduleId: ModuleId) => {
    return createModuleWithDirection(moduleId) as HotModule
  }

  // Node.js: creates Context (no refresh parameter)
  const createContext = (
    module: HotModule,
    exports: Exports,
    _refresh?: any
  ) => {
    return new (Context as any as ContextConstructor<HotModule>)(
      module,
      exports
    )
  }

  // Node.js: no hooks wrapper, just execute directly
  const runWithHooks = (module: HotModule, exec: (refresh: any) => void) => {
    exec(undefined) // no refresh context
  }

  // Use shared instantiation logic (includes hot API setup)
  const newModule = instantiateModuleShared(
    id,
    sourceType,
    sourceData,
    moduleFactories,
    devModuleCache,
    runtimeModules,
    createModuleObjectFn,
    createContext,
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
  const module = devModuleCache[moduleId]

  if (module) {
    if (module.error) {
      throw module.error
    }
    return module
  }

  return instantiateRuntimeModule(chunkPath, moduleId)
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
  // Track parent-child relationship
  trackModuleImport(sourceModule, id, devModuleCache[id])

  const module = devModuleCache[id]

  if (module) {
    if (module.error) {
      throw module.error
    }

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
