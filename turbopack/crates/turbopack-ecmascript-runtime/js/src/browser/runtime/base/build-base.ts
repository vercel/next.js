/// <reference path="./runtime-base.ts" />
/// <reference path="./dummy.ts" />

declare var augmentContext: (context: unknown) => unknown

const moduleCache: ModuleCache<Module> = {}

/**
 * Gets or instantiates a runtime module.
 */
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getOrInstantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): Module {
  const module = moduleCache[moduleId]
  if (module) {
    if (module.error) {
      throw module.error
    }
    return module
  }

  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}

/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */
// Used by the backend
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getOrInstantiateModuleFromParent: GetOrInstantiateModuleFromParent<
  Module
> = (id, sourceModule) => {
  const module = moduleCache[id]

  if (module) {
    return module
  }

  return instantiateModule(id, SourceType.Parent, sourceModule.id)
}

function instantiateModule(
  id: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): Module {
  const moduleFactory = moduleFactories[id]
  if (typeof moduleFactory !== 'function') {
    // This can happen if modules incorrectly handle HMR disposes/updates,
    // e.g. when they keep a `setTimeout` around which still executes old code
    // and contains e.g. a `require("something")` call.
    let instantiationReason
    switch (sourceType) {
      case SourceType.Runtime:
        instantiationReason = `as a runtime entry of chunk ${sourceData}`
        break
      case SourceType.Parent:
        instantiationReason = `because it was required from module ${sourceData}`
        break
      case SourceType.Update:
        instantiationReason = 'because of an HMR update'
        break
      default:
        invariant(
          sourceType,
          (sourceType) => `Unknown source type: ${sourceType}`
        )
    }
    throw new Error(
      `Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`
    )
  }

  switch (sourceType) {
    case SourceType.Runtime:
      runtimeModules.add(id)
      break
    case SourceType.Parent:
      // No need to add this module as a child of the parent module here, this
      // has already been taken care of in `getOrInstantiateModuleFromParent`.
      break
    case SourceType.Update:
      throw new Error('Unexpected')
    default:
      invariant(
        sourceType,
        (sourceType) => `Unknown source type: ${sourceType}`
      )
  }

  const module: Module = {
    exports: {},
    error: undefined,
    loaded: false,
    id,
    namespaceObject: undefined,
  }

  moduleCache[id] = module

  // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
  try {
    const r = commonJsRequire.bind(null, module)
    moduleFactory(
      augmentContext({
        a: asyncModule.bind(null, module),
        e: module.exports,
        r: commonJsRequire.bind(null, module),
        t: runtimeRequire,
        f: moduleContext,
        i: esmImport.bind(null, module),
        s: esmExport.bind(null, module, module.exports, moduleCache),
        j: dynamicExport.bind(null, module, module.exports, moduleCache),
        v: exportValue.bind(null, module, moduleCache),
        n: exportNamespace.bind(null, module, moduleCache),
        m: module,
        c: moduleCache,
        M: moduleFactories,
        l: loadChunk.bind(null, SourceType.Parent, id),
        L: loadChunkByUrl.bind(null, SourceType.Parent, id),
        w: loadWebAssembly.bind(null, SourceType.Parent, id),
        u: loadWebAssemblyModule.bind(null, SourceType.Parent, id),
        P: resolveAbsolutePath,
        U: relativeURL,
        R: createResolvePathFromModule(r),
        b: getWorkerBlobURL,
      })
    )
  } catch (error) {
    module.error = error as any
    throw error
  }

  module.loaded = true
  if (module.namespaceObject && module.exports !== module.namespaceObject) {
    // in case of a circular dependency: cjs1 -> esm2 -> cjs1
    interopEsm(module.exports, module.namespaceObject)
  }

  return module
}
