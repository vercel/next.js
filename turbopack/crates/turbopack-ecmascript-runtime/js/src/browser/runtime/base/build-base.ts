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
    factoryNotAvailable(id, sourceType, sourceData)
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

  const module: Module = createModuleObject(id)

  moduleCache[id] = module

  // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
  try {
    const context = new (Context as any as ContextConstructor<Module>)(module)
    moduleFactory(context)
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
