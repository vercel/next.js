/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../shared/runtime-utils.ts" />
/// <reference path="../shared-node/base-externals-utils.ts" />
/// <reference path="../shared-node/node-externals-utils.ts" />
/// <reference path="../shared-node/node-wasm-utils.ts" />

enum SourceType {
  /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   * SourceData is a ChunkPath.
   */
  Runtime = 0,
  /**
   * The module was instantiated because a parent module imported it.
   * SourceData is a ModuleId.
   */
  Parent = 1,
}

type SourceData = ChunkPath | ModuleId

process.env.TURBOPACK = '1'

interface TurbopackNodeBuildContext extends TurbopackBaseContext<Module> {
  R: ResolvePathFromModule
  x: ExternalRequire
  y: ExternalImport
}

const nodeContextPrototype = Context.prototype as TurbopackNodeBuildContext

type ModuleFactory = (
  this: Module['exports'],
  context: TurbopackNodeBuildContext
) => unknown

const url = require('url') as typeof import('url')

const moduleFactories: ModuleFactories = new Map()
nodeContextPrototype.M = moduleFactories
const moduleCache: ModuleCache<Module> = Object.create(null)
nodeContextPrototype.c = moduleCache

/**
 * Returns an absolute path to the given module's id.
 */
function resolvePathFromModule(
  this: TurbopackBaseContext<Module>,
  moduleId: string
): string {
  const exported = this.r(moduleId)
  const exportedPath = exported?.default ?? exported
  if (typeof exportedPath !== 'string') {
    return exported as any
  }

  const strippedAssetPrefix = exportedPath.slice(ASSET_PREFIX.length)
  const resolved = path.resolve(RUNTIME_ROOT, strippedAssetPrefix)

  return url.pathToFileURL(resolved).href
}
nodeContextPrototype.R = resolvePathFromModule

function loadRuntimeChunk(sourcePath: ChunkPath, chunkData: ChunkData): void {
  if (typeof chunkData === 'string') {
    loadRuntimeChunkPath(sourcePath, chunkData)
  } else {
    loadRuntimeChunkPath(sourcePath, chunkData.path)
  }
}

const loadedChunks = new Set<ChunkPath>()
const unsupportedLoadChunk = Promise.resolve(undefined)
const loadedChunk: Promise<void> = Promise.resolve(undefined)
const chunkCache = new Map<ChunkPath, Promise<void>>()

function clearChunkCache() {
  chunkCache.clear()
}

function loadRuntimeChunkPath(
  sourcePath: ChunkPath,
  chunkPath: ChunkPath
): void {
  if (!isJs(chunkPath)) {
    // We only support loading JS chunks in Node.js.
    // This branch can be hit when trying to load a CSS chunk.
    return
  }

  if (loadedChunks.has(chunkPath)) {
    return
  }

  try {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath)
    const chunkModules: CompressedModuleFactories = require(resolved)
    installCompressedModuleFactories(chunkModules, 0, moduleFactories)
    loadedChunks.add(chunkPath)
  } catch (e) {
    let errorMessage = `Failed to load chunk ${chunkPath}`

    if (sourcePath) {
      errorMessage += ` from runtime for chunk ${sourcePath}`
    }

    throw new Error(errorMessage, {
      cause: e,
    })
  }
}

function loadChunkAsync(
  this: TurbopackBaseContext<Module>,
  chunkData: ChunkData
): Promise<void> {
  const chunkPath = typeof chunkData === 'string' ? chunkData : chunkData.path
  if (!isJs(chunkPath)) {
    // We only support loading JS chunks in Node.js.
    // This branch can be hit when trying to load a CSS chunk.
    return unsupportedLoadChunk
  }

  let entry = chunkCache.get(chunkPath)
  if (entry === undefined) {
    try {
      // resolve to an absolute path to simplify `require` handling
      const resolved = path.resolve(RUNTIME_ROOT, chunkPath)
      // TODO: consider switching to `import()` to enable concurrent chunk loading and async file io
      // However this is incompatible with hot reloading (since `import` doesn't use the require cache)
      const chunkModules: CompressedModuleFactories = require(resolved)
      installCompressedModuleFactories(chunkModules, 0, moduleFactories)
      entry = loadedChunk
    } catch (e) {
      const errorMessage = `Failed to load chunk ${chunkPath} from module ${this.m.id}`

      // Cache the failure promise, future requests will also get this same rejection
      entry = Promise.reject(
        new Error(errorMessage, {
          cause: e,
        })
      )
    }
    chunkCache.set(chunkPath, entry)
  }
  // TODO: Return an instrumented Promise that React can use instead of relying on referential equality.
  return entry
}
contextPrototype.l = loadChunkAsync

function loadChunkAsyncByUrl(
  this: TurbopackBaseContext<Module>,
  chunkUrl: string
) {
  const path = url.fileURLToPath(new URL(chunkUrl, RUNTIME_ROOT)) as ChunkPath
  return loadChunkAsync.call(this, path)
}
contextPrototype.L = loadChunkAsyncByUrl

function loadWebAssembly(
  chunkPath: ChunkPath,
  _edgeModule: () => WebAssembly.Module,
  imports: WebAssembly.Imports
) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath)

  return instantiateWebAssemblyFromPath(resolved, imports)
}
contextPrototype.w = loadWebAssembly

function loadWebAssemblyModule(
  chunkPath: ChunkPath,
  _edgeModule: () => WebAssembly.Module
) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath)

  return compileWebAssemblyFromPath(resolved)
}
contextPrototype.u = loadWebAssemblyModule

function getWorkerBlobURL(_chunks: ChunkPath[]): string {
  throw new Error('Worker blobs are not implemented yet for Node.js')
}

nodeContextPrototype.b = getWorkerBlobURL

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
    let instantiationReason: string
    switch (sourceType) {
      case SourceType.Runtime:
        instantiationReason = `as a runtime entry of chunk ${sourceData}`
        break
      case SourceType.Parent:
        instantiationReason = `because it was required from module ${sourceData}`
        break
      default:
        invariant(
          sourceType,
          (sourceType) => `Unknown source type: ${sourceType}`
        )
    }
    throw new Error(
      `Module ${id} was instantiated ${instantiationReason}, but the module factory is not available.`
    )
  }

  const module: Module = createModuleObject(id)
  const exports = module.exports
  moduleCache[id] = module

  const context = new (Context as any as ContextConstructor<Module>)(
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

  module.loaded = true
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
  sourceModule: Module
): Module {
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
): Module {
  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}

/**
 * Retrieves a module from the cache, or instantiate it as a runtime module if it is not cached.
 */
// @ts-ignore TypeScript doesn't separate this module space from the browser runtime
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

  return instantiateRuntimeModule(chunkPath, moduleId)
}

const regexJsUrl = /\.js(?:\?[^#]*)?(?:#.*)?$/
/**
 * Checks if a given path/URL ends with .js, optionally followed by ?query or #fragment.
 */
function isJs(chunkUrlOrPath: ChunkUrl | ChunkPath): boolean {
  return regexJsUrl.test(chunkUrlOrPath)
}

module.exports = (sourcePath: ChunkPath) => ({
  m: (id: ModuleId) => getOrInstantiateRuntimeModule(sourcePath, id),
  c: (chunkData: ChunkData) => loadRuntimeChunk(sourcePath, chunkData),
})
