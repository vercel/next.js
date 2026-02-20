/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="./runtime-base.ts" />

/**
 * Production Node.js runtime.
 * Uses ModuleWithDirection and simple module instantiation without HMR support.
 */

// moduleCache and moduleFactories are declared in runtime-base.ts

// this is read in runtime-utils.ts so it creates a module with direction for hmr
createModuleWithDirectionFlag = true

interface TurbopackNodeBuildContext
  extends TurbopackBaseContext<ModuleWithDirection> {
  R: ResolvePathFromModule
  x: ExternalRequire
  y: ExternalImport
  C: typeof clearChunkCache
}

const nodeContextPrototype = Context.prototype as TurbopackNodeBuildContext

nodeContextPrototype.q = exportUrl
nodeContextPrototype.M = moduleFactories
// Cast moduleCache to ModuleWithDirection for production mode
nodeContextPrototype.c = moduleCache as ModuleCache<ModuleWithDirection>
nodeContextPrototype.R = resolvePathFromModule
nodeContextPrototype.b = createWorker
nodeContextPrototype.C = clearChunkCache

function instantiateModule(
  id: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): ModuleWithDirection {
  const moduleFactory = moduleFactories.get(id)
  if (typeof moduleFactory !== 'function') {
    // This can happen if modules incorrectly handle HMR disposes/updates,
    // e.g. when they keep a `setTimeout` around which still executes old code
    // and contains e.g. a `require("something")` call.
    throw new Error(factoryNotAvailableMessage(id, sourceType, sourceData))
  }

  const module: ModuleWithDirection = createModuleWithDirection(id)
  const exports = module.exports
  moduleCache[id] = module

  const context =
    new (Context as any as ContextConstructor<ModuleWithDirection>)(
      module,
      exports
    )
  // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
  try {
    moduleFactory(context, module, exports)
  } catch (error) {
    module.error = error as any
    throw error
  }

  ;(module as any).loaded = true
  if (module.namespaceObject && module.exports !== module.namespaceObject) {
    // in case of a circular dependency: cjs1 -> esm2 -> cjs1
    interopEsm(module.exports, module.namespaceObject)
  }

  return module
}

/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */
// @ts-ignore
function getOrInstantiateModuleFromParent(
  id: ModuleId,
  sourceModule: ModuleWithDirection
): ModuleWithDirection {
  const module = moduleCache[id]

  if (module) {
    if (module.error) {
      throw module.error
    }

    return module
  }

  return instantiateModule(id, SourceType.Parent, sourceModule.id)
}

/**
 * Instantiates a runtime module.
 */
function instantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): ModuleWithDirection {
  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}

/**
 * Retrieves a module from the cache, or instantiate it as a runtime module if it is not cached.
 */
// @ts-ignore TypeScript doesn't separate this module space from the browser runtime
function getOrInstantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): ModuleWithDirection {
  const module = moduleCache[moduleId]

  if (module) {
    if (module.error) {
      throw module.error
    }
    return module
  }

  return instantiateRuntimeModule(chunkPath, moduleId)
}

module.exports = (sourcePath: ChunkPath) => ({
  m: (id: ModuleId) => getOrInstantiateRuntimeModule(sourcePath, id),
  c: (chunkData: ChunkData) => loadRuntimeChunk(sourcePath, chunkData),
})
