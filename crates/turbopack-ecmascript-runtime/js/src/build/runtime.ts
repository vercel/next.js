/// <reference path="../shared/runtime-utils.ts" />

declare var RUNTIME_PUBLIC_PATH: string;

enum SourceType {
  /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   */
  Runtime = 0,
  /**
   * The module was instantiated because a parent module imported it.
   */
  Parent = 1,
}

type SourceInfo =
  | {
      type: SourceType.Runtime;
      chunkPath: ChunkPath;
    }
  | {
      type: SourceType.Parent;
      parentId: ModuleId;
    };

interface RequireContextEntry {
  external: boolean;
}

type ExternalRequire = (id: ModuleId) => Exports | EsmNamespaceObject;

interface TurbopackNodeBuildContext {
  e: Module["exports"];
  r: CommonJsRequire;
  x: ExternalRequire;
  f: RequireContextFactory;
  i: EsmImport;
  s: EsmExport;
  j: typeof dynamicExport;
  v: ExportValue;
  n: typeof exportNamespace;
  m: Module;
  c: ModuleCache;
  l: LoadChunk;
  g: typeof globalThis;
  __dirname: string;
}

type ModuleFactory = (
  this: Module["exports"],
  context: TurbopackNodeBuildContext
) => undefined;

const path = require("path");
const relativePathToRuntimeRoot = path.relative(RUNTIME_PUBLIC_PATH, ".");
const RUNTIME_ROOT = path.resolve(__filename, relativePathToRuntimeRoot);

const moduleFactories: ModuleFactories = Object.create(null);
const moduleCache: ModuleCache = Object.create(null);

function commonJsRequireContext(
  entry: RequireContextEntry,
  sourceModule: Module
): Exports {
  return entry.external
    ? externalRequire(entry.id(), false)
    : commonJsRequire(sourceModule, entry.id());
}

function externalRequire(
  id: ModuleId,
  esm: boolean = false
): Exports | EsmNamespaceObject {
  let raw;
  try {
    raw = require(id);
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`);
  }
  if (!esm || raw.__esModule) {
    return raw;
  }
  const ns = {};
  interopEsm(raw, ns, true);
  return ns;
}
externalRequire.resolve = (
  id: string,
  options?:
    | {
        paths?: string[] | undefined;
      }
    | undefined
) => {
  return require.resolve(id, options);
};

function loadChunk(chunkPath: ChunkPath) {
  if (!chunkPath.endsWith(".js")) {
    // We only support loading JS chunks in Node.js.
    // This branch can be hit when trying to load a CSS chunk.
    return;
  }

  const resolved = require.resolve(path.resolve(RUNTIME_ROOT, chunkPath));
  delete require.cache[resolved];
  const chunkModules: ModuleFactories = require(resolved);

  for (const [moduleId, moduleFactory] of Object.entries(chunkModules)) {
    if (!moduleFactories[moduleId]) {
      moduleFactories[moduleId] = moduleFactory;
    }
  }
}

function loadChunkAsync(source: SourceInfo, chunkPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      loadChunk(chunkPath);
    } catch (err) {
      reject(err);
      return;
    }
    resolve();
  });
}

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
    }
    throw new Error(
      `Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`
    );
  }

  let parents: ModuleId[];
  switch (source.type) {
    case SourceType.Runtime:
      parents = [];
      break;
    case SourceType.Parent:
      // No need to add this module as a child of the parent module here, this
      // has already been taken care of in `getOrInstantiateModuleFromParent`.
      parents = [source.parentId];
      break;
  }

  const module: Module = {
    exports: {},
    error: undefined,
    loaded: false,
    id,
    parents,
    children: [],
    namespaceObject: undefined,
  };
  moduleCache[id] = module;

  // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
  try {
    moduleFactory.call(module.exports, {
      e: module.exports,
      r: commonJsRequire.bind(null, module),
      x: externalRequire,
      f: requireContext.bind(null, module),
      i: esmImport.bind(null, module),
      s: esm.bind(null, module.exports),
      j: dynamicExport.bind(null, module),
      v: exportValue.bind(null, module),
      n: exportNamespace.bind(null, module),
      m: module,
      c: moduleCache,
      l: loadChunkAsync.bind(null, { type: SourceType.Parent, parentId: id }),
      g: globalThis,
      __dirname: module.id.replace(/(^|\/)[\/]+$/, ""),
    });
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

/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */
function getOrInstantiateModuleFromParent(
  id: ModuleId,
  sourceModule: Module
): Module {
  const module = moduleCache[id];

  if (sourceModule.children.indexOf(id) === -1) {
    sourceModule.children.push(id);
  }

  if (module) {
    if (module.parents.indexOf(sourceModule.id) === -1) {
      module.parents.push(sourceModule.id);
    }

    return module;
  }

  return instantiateModule(id, {
    type: SourceType.Parent,
    parentId: sourceModule.id,
  });
}

/**
 * Instantiates a runtime module.
 */
function instantiateRuntimeModule(
  moduleId: ModuleId,
  chunkPath: ChunkPath
): Module {
  return instantiateModule(moduleId, { type: SourceType.Runtime, chunkPath });
}

/**
 * Retrieves a module from the cache, or instantiate it as a runtime module if it is not cached.
 */
function getOrInstantiateRuntimeModule(
  moduleId: ModuleId,
  chunkPath: ChunkPath
): Module {
  const module = moduleCache[moduleId];
  if (module) {
    if (module.error) {
      throw module.error;
    }
    return module;
  }

  return instantiateRuntimeModule(moduleId, chunkPath);
}

module.exports = {
  getOrInstantiateRuntimeModule,
  loadChunk,
};
