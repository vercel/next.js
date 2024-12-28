/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../shared/runtime-utils.ts" />
/// <reference path="../shared-node/base-externals-utils.ts" />
/// <reference path="../shared-node/node-externals-utils.ts" />
/// <reference path="../shared-node/node-wasm-utils.ts" />

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

function stringifySourceInfo(source: SourceInfo): string {
  switch (source.type) {
    case SourceType.Runtime:
      return `runtime for chunk ${source.chunkPath}`;
    case SourceType.Parent:
      return `parent module ${source.parentId}`;
    default:
      invariant(source, (source) => `Unknown source type: ${source?.type}`);
  }
}

type ExternalRequire = (
  id: ModuleId,
  thunk: () => any,
  esm?: boolean
) => Exports | EsmNamespaceObject;
type ExternalImport = (id: ModuleId) => Promise<Exports | EsmNamespaceObject>;

interface TurbopackNodeBuildContext extends TurbopackBaseContext<Module> {
  R: ResolvePathFromModule;
  x: ExternalRequire;
  y: ExternalImport;
}

type ModuleFactory = (
  this: Module["exports"],
  context: TurbopackNodeBuildContext
) => undefined;

const url = require("url") as typeof import('url');
const fs = require("fs/promises") as typeof import('fs/promises');

const moduleFactories: ModuleFactories = Object.create(null);
const moduleCache: ModuleCache<ModuleWithDirection> = Object.create(null);

/**
 * Returns an absolute path to the given module's id.
 */
function createResolvePathFromModule(
  resolver: (moduleId: string) => Exports
): (moduleId: string) => string {
  return function resolvePathFromModule(moduleId: string): string {
    const exported = resolver(moduleId);
    const exportedPath = exported?.default ?? exported;
    if (typeof exportedPath !== "string") {
      return exported as any;
    }

    const strippedAssetPrefix = exportedPath.slice(ASSET_PREFIX.length);
    const resolved = path.resolve(
      RUNTIME_ROOT,
      strippedAssetPrefix
    );

    return url.pathToFileURL(resolved).href;
  };
}

function loadChunk(chunkData: ChunkData, source?: SourceInfo): void {
  if (typeof chunkData === "string") {
    return loadChunkPath(chunkData, source);
  } else {
    return loadChunkPath(chunkData.path, source);
  }
}

function loadChunkPath(chunkPath: ChunkPath, source?: SourceInfo): void {
  if (!chunkPath.endsWith(".js")) {
    // We only support loading JS chunks in Node.js.
    // This branch can be hit when trying to load a CSS chunk.
    return;
  }

  try {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
    const chunkModules: ModuleFactories = require(resolved);

    for (const [moduleId, moduleFactory] of Object.entries(chunkModules)) {
      if (!moduleFactories[moduleId]) {
        moduleFactories[moduleId] = moduleFactory;
      }
    }
  } catch (e) {
    let errorMessage = `Failed to load chunk ${chunkPath}`;

    if (source) {
      errorMessage += ` from ${stringifySourceInfo(source)}`;
    }

    throw new Error(errorMessage, {
      cause: e,
    });
  }
}

async function loadChunkAsync(
  source: SourceInfo,
  chunkData: ChunkData
): Promise<any> {
  const chunkPath = typeof chunkData === "string" ? chunkData : chunkData.path;
  if (!chunkPath.endsWith(".js")) {
    // We only support loading JS chunks in Node.js.
    // This branch can be hit when trying to load a CSS chunk.
    return;
  }

  const resolved = path.resolve(RUNTIME_ROOT, chunkPath);

  try {
    const contents = await fs.readFile(resolved, "utf-8");

    const localRequire = (id: string) => {
      let resolvedId = require.resolve(id, {paths: [path.dirname(resolved)]});
      return require(resolvedId);
    }
    const module = {
      exports: {},
    };
    // TODO: Use vm.runInThisContext once our minimal supported Node.js version includes https://github.com/nodejs/node/pull/52153
    // eslint-disable-next-line no-eval -- Can't use vm.runInThisContext due to https://github.com/nodejs/node/issues/52102
    (0, eval)(
      "(function(module, exports, require, __dirname, __filename) {" +
        contents +
        "\n})" +
        "\n//# sourceURL=" + url.pathToFileURL(resolved),
    )(module, module.exports, localRequire, path.dirname(resolved), resolved);

    const chunkModules: ModuleFactories = module.exports;
    for (const [moduleId, moduleFactory] of Object.entries(chunkModules)) {
      if (!moduleFactories[moduleId]) {
        moduleFactories[moduleId] = moduleFactory;
      }
    }
  } catch (e) {
    let errorMessage = `Failed to load chunk ${chunkPath}`;

    if (source) {
      errorMessage += ` from ${stringifySourceInfo(source)}`;
    }

    throw new Error(errorMessage, {
      cause: e,
    });
  }
}

function loadWebAssembly(chunkPath: ChunkPath, imports: WebAssembly.Imports) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath);

  return instantiateWebAssemblyFromPath(resolved, imports);
}

function loadWebAssemblyModule(chunkPath: ChunkPath) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath);

  return compileWebAssemblyFromPath(resolved);
}

function getWorkerBlobURL(_chunks: ChunkPath[]): string {
  throw new Error("Worker blobs are not implemented yet for Node.js");
}

function instantiateModule(id: ModuleId, source: SourceInfo): ModuleWithDirection {
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
      default:
        invariant(source, (source) => `Unknown source type: ${source?.type}`);
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
    default:
      invariant(source, (source) => `Unknown source type: ${source?.type}`);
  }

  const module: ModuleWithDirection = {
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
    const r = commonJsRequire.bind(null, module);
    moduleFactory.call(module.exports, {
      a: asyncModule.bind(null, module),
      e: module.exports,
      r,
      t: runtimeRequire,
      x: externalRequire,
      y: externalImport,
      f: moduleContext,
      i: esmImport.bind(null, module),
      s: esmExport.bind(null, module, module.exports),
      j: dynamicExport.bind(null, module, module.exports),
      v: exportValue.bind(null, module),
      n: exportNamespace.bind(null, module),
      m: module,
      c: moduleCache,
      M: moduleFactories,
      l: loadChunkAsync.bind(null, { type: SourceType.Parent, parentId: id }),
      w: loadWebAssembly,
      u: loadWebAssemblyModule,
      g: globalThis,
      P: resolveAbsolutePath,
      U: relativeURL,
      R: createResolvePathFromModule(r),
      b: getWorkerBlobURL,
      z: requireStub,
      __dirname: typeof module.id === "string" ? module.id.replace(/(^|\/)\/+$/, "") : module.id
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
// @ts-ignore
function getOrInstantiateModuleFromParent(
  id: ModuleId,
  sourceModule: ModuleWithDirection
): ModuleWithDirection {
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
// @ts-ignore TypeScript doesn't separate this module space from the browser runtime
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
