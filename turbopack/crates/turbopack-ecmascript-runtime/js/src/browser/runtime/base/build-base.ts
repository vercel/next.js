/// <reference path="./runtime-base.ts" />
/// <reference path="./dummy.ts" />

declare var augmentContext: ((context: unknown) => unknown);

const moduleCache: ModuleCache<Module> = {};

/**
 * Gets or instantiates a runtime module.
 */
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getOrInstantiateRuntimeModule(
  moduleId: ModuleId,
  chunkPath: ChunkPath,
): Module {
  const module = moduleCache[moduleId];
  if (module) {
    if (module.error) {
      throw module.error;
    }
    return module;
  }

  return instantiateModule(moduleId, { type: SourceType.Runtime, chunkPath });
}

/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */
// Used by the backend
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getOrInstantiateModuleFromParent: GetOrInstantiateModuleFromParent<Module> = (
  id,
  sourceModule
) => {
  const module = moduleCache[id];

  if (module) {
    return module;
  }

  return instantiateModule(id, {
    type: SourceType.Parent,
    parentId: sourceModule.id,
  });
};

function instantiateModule(id: ModuleId, source: SourceInfo): Module {
  const moduleFactory = moduleFactories[id];
  if (typeof moduleFactory !== "function") {
    // This can happen if modules incorrectly handle HMR disposes/updates,
    // e.g. when they keep a `setTimeout` around which still executes old code
    // and contains e.g. a `require("something")` call.
    let instantiationReason;
    switch (source.type) {
      case SourceType.Runtime:
        instantiationReason = `as a runtime entry of chunk ${source.chunkPath}`;
        break;
      case SourceType.Parent:
        instantiationReason = `because it was required from module ${source.parentId}`;
        break;
      case SourceType.Update:
        instantiationReason = "because of an HMR update";
        break;
      default:
        invariant(source, (source) => `Unknown source type: ${source?.type}`);
    }
    throw new Error(
      `Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`
    );
  }

  switch (source.type) {
    case SourceType.Runtime:
      runtimeModules.add(id);
      break;
    case SourceType.Parent:
      // No need to add this module as a child of the parent module here, this
      // has already been taken care of in `getOrInstantiateModuleFromParent`.
      break;
    case SourceType.Update:
      throw new Error('Unexpected')
    default:
      invariant(source, (source) => `Unknown source type: ${source?.type}`);
  }

  const module: Module = {
    exports: {},
    error: undefined,
    loaded: false,
    id,
    namespaceObject: undefined,
  };

  moduleCache[id] = module;

  // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
  try {
    const sourceInfo: SourceInfo = { type: SourceType.Parent, parentId: id };

    const r = commonJsRequire.bind(null, module);
    moduleFactory.call(
      module.exports,
      augmentContext({
        a: asyncModule.bind(null, module),
        e: module.exports,
        r: commonJsRequire.bind(null, module),
        t: runtimeRequire,
        f: moduleContext,
        i: esmImport.bind(null, module),
        s: esmExport.bind(null, module, module.exports),
        j: dynamicExport.bind(null, module, module.exports),
        v: exportValue.bind(null, module),
        n: exportNamespace.bind(null, module),
        m: module,
        c: moduleCache,
        M: moduleFactories,
        l: loadChunk.bind(null, sourceInfo),
        w: loadWebAssembly.bind(null, sourceInfo),
        u: loadWebAssemblyModule.bind(null, sourceInfo),
        g: globalThis,
        P: resolveAbsolutePath,
        U: relativeURL,
        R: createResolvePathFromModule(r),
        b: getWorkerBlobURL,
        d: typeof module.id === "string" ? module.id.replace(/(^|\/)\/+$/, "") : module.id
      })
    );
  } catch (error) {
    module.error = error as any;
    throw error;
  }

  module.loaded = true;
  if (module.namespaceObject && module.exports !== module.namespaceObject) {
    // in case of a circular dependency: cjs1 -> esm2 -> cjs1
    interopEsm(module.exports, module.namespaceObject);
  }

  return module;
}

