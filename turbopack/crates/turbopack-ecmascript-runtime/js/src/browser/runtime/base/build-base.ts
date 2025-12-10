/// <reference path="./runtime-base.ts" />
/// <reference path="./dummy.ts" />

const moduleCache: ModuleCache<Module> = {}
contextPrototype.c = moduleCache

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
    if (module.error) {
      throw module.error
    }
    return module
  }

  return instantiateModule(id, SourceType.Parent, sourceModule.id)
}

function instantiateModule(
  id: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): Module {
  const moduleFactory = moduleFactories.get(id)
  if (typeof moduleFactory !== 'function') {
    // This can happen if modules incorrectly handle HMR disposes/updates,
    // e.g. when they keep a `setTimeout` around which still executes old code
    // and contains e.g. a `require("something")` call.
    throw new Error(factoryNotAvailableMessage(id, sourceType, sourceData))
  }

  const module: Module = createModuleObject(id)
  const exports = module.exports

  moduleCache[id] = module

  // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
  const context = new (Context as any as ContextConstructor<Module>)(
    module,
    exports
  )
  try {
    moduleFactory(context, module, exports)
  } catch (error) {
    module.error = error as any
    throw error
  }

  if (module.namespaceObject && module.exports !== module.namespaceObject) {
    // in case of a circular dependency: cjs1 -> esm2 -> cjs1
    interopEsm(module.exports, module.namespaceObject)
  }

  return module
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerChunk(registration: ChunkRegistration) {
  const chunkPath = getPathFromScript(registration[0])
  let runtimeParams: RuntimeParams | undefined
  // When bootstrapping we are passed a single runtimeParams object so we can distinguish purely based on length
  if (registration.length === 2) {
    runtimeParams = registration[1] as RuntimeParams
  } else {
    runtimeParams = undefined
    installCompressedModuleFactories(
      registration as CompressedModuleFactories,
      /* offset= */ 1,
      moduleFactories
    )
  }

  return BACKEND.registerChunk(chunkPath, runtimeParams)
}
