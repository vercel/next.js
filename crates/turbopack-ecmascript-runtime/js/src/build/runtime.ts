/// <reference path="../shared/runtime-utils.ts" />
/// <reference path="../shared-node/node-utils.ts" />

declare var RUNTIME_PUBLIC_PATH: string;
declare var OUTPUT_ROOT: string;

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

type ExternalRequire = (id: ModuleId) => Exports | EsmNamespaceObject;
type ExternalImport = (id: ModuleId) => Promise<Exports | EsmNamespaceObject>;

interface TurbopackNodeBuildContext extends TurbopackBaseContext {
  p: ResolveAbsolutePath
  U: RelativeURL,
  x: ExternalRequire;
  y: ExternalImport;
}

type ModuleFactory = (
  this: Module["exports"],
  context: TurbopackNodeBuildContext
) => undefined;

const path = require("path");
const relativePathToRuntimeRoot = path.relative(RUNTIME_PUBLIC_PATH, ".");
// Compute the relative path to the `distDir`.
const relativePathToDistRoot = path.relative(path.join(OUTPUT_ROOT, RUNTIME_PUBLIC_PATH), ".");
const RUNTIME_ROOT = path.resolve(__filename, relativePathToRuntimeRoot);
// Compute the absolute path to the root, by stripping distDir from the absolute path to this file.
const ABSOLUTE_ROOT = path.resolve(__filename, relativePathToDistRoot);

const moduleFactories: ModuleFactories = Object.create(null);
const moduleCache: ModuleCache = Object.create(null);

/**
 * Returns an absolute path to the given module path.
 * Module path should be relative, either path to a file or a directory.
 *
 * This fn allows to calculate an absolute path for some global static values, such as
 * `__dirname` or `import.meta.url` that Turbopack will not embeds in compile time.
 * See ImportMetaBinding::code_generation for the usage.
 */
function resolveAbsolutePath(modulePath?: string): string {
  if (modulePath) {
    // Module path can contain common relative path to the root, recalaute to avoid duplicated joined path.
    const relativePathToRoot = path.relative(ABSOLUTE_ROOT, modulePath);
    return path.join(ABSOLUTE_ROOT, relativePathToRoot);
  }
  return ABSOLUTE_ROOT;
}

/**
 * A pseudo, `fake` URL object to resolve to the its relative path.
 * When urlrewritebehavior is set to relative, calls to the `new URL()` will construct url without base using this
 * runtime function to generate context-agnostic urls between different rendering context, i.e ssr / client to avoid
 * hydration mismatch.
 *
 * This is largely based on the webpack's existing implementation at
 * https://github.com/webpack/webpack/blob/87660921808566ef3b8796f8df61bd79fc026108/lib/runtime/RelativeUrlRuntimeModule.js
 */
var relativeURL = function(this: any, inputUrl: string) {
  const realUrl = new URL(inputUrl, "x:/");
  const values: Record<string, any> = {};
  for (var key in realUrl) values[key] = (realUrl as any)[key];
  values.href = inputUrl;
  values.pathname = inputUrl.replace(/[?#].*/, "");
  values.origin = values.protocol = "";
  values.toString = values.toJSON = (..._args: Array<any>) => inputUrl;
  for (var key in values) Object.defineProperty(this, key, { enumerable: true, configurable: true, value: values[key] });
}

relativeURL.prototype = URL.prototype;

function loadChunk(chunkData: ChunkData): void {
  if (typeof chunkData === "string") {
    return loadChunkPath(chunkData);
  } else {
    return loadChunkPath(chunkData.path);
  }
}

function loadChunkPath(chunkPath: ChunkPath): void {
  if (!chunkPath.endsWith(".js")) {
    // We only support loading JS chunks in Node.js.
    // This branch can be hit when trying to load a CSS chunk.
    return;
  }

  const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
  const chunkModules: ModuleFactories = require(resolved);

  for (const [moduleId, moduleFactory] of Object.entries(chunkModules)) {
    if (!moduleFactories[moduleId]) {
      moduleFactories[moduleId] = moduleFactory;
    }
  }
}

async function loadChunkAsync(
  source: SourceInfo,
  chunkData: ChunkData
): Promise<any> {
  return new Promise<void>((resolve, reject) => {
    try {
      loadChunk(chunkData);
    } catch (err) {
      reject(err);
      return;
    }
    resolve();
  });
}

function loadWebAssembly(chunkPath: ChunkPath, imports: WebAssembly.Imports) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath);

  return instantiateWebAssemblyFromPath(resolved, imports);
}

function loadWebAssemblyModule(chunkPath: ChunkPath) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath);

  return compileWebAssemblyFromPath(resolved);
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
      a: asyncModule.bind(null, module),
      e: module.exports,
      r: commonJsRequire.bind(null, module),
      t: runtimeRequire,
      x: externalRequire,
      y: externalImport,
      f: requireContext.bind(null, module),
      i: esmImport.bind(null, module),
      s: esmExport.bind(null, module, module.exports),
      j: dynamicExport.bind(null, module, module.exports),
      v: exportValue.bind(null, module),
      n: exportNamespace.bind(null, module),
      m: module,
      c: moduleCache,
      l: loadChunkAsync.bind(null, { type: SourceType.Parent, parentId: id }),
      w: loadWebAssembly,
      u: loadWebAssemblyModule,
      g: globalThis,
      p: resolveAbsolutePath,
      U: relativeURL,
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
