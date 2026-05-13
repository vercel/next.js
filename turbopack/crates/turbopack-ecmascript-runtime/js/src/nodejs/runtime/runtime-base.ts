/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../shared/runtime/runtime-utils.ts" />
/// <reference path="../../shared-node/base-externals-utils.ts" />
/// <reference path="../../shared-node/node-externals-utils.ts" />
/// <reference path="../../shared-node/node-wasm-utils.ts" />
/// <reference path="./nodejs-globals.d.ts" />

/**
 * Base Node.js runtime shared between production and development.
 * Contains chunk loading, module caching, and other non-HMR functionality.
 */

process.env.TURBOPACK = '1'

const url = require('url') as typeof import('url')

const moduleFactories: ModuleFactories = new Map()
const moduleCache: ModuleCache<Module> = Object.create(null)

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

/**
 * Exports a URL value. No suffix is added in Node.js runtime.
 */
function exportUrl(
  this: TurbopackBaseContext<Module>,
  urlValue: string,
  id: ModuleId | undefined
) {
  exportValue.call(this, urlValue, id)
}

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
  loadedChunks.clear()
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
  } catch (cause) {
    let errorMessage = `Failed to load chunk ${chunkPath}`

    if (sourcePath) {
      errorMessage += ` from runtime for chunk ${sourcePath}`
    }

    const error = new Error(errorMessage, { cause })
    error.name = 'ChunkLoadError'
    throw error
  }
}

function loadChunkAsync<TModule extends Module>(
  this: TurbopackBaseContext<TModule>,
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
    } catch (cause) {
      const errorMessage = `Failed to load chunk ${chunkPath} from module ${this.m.id}`
      const error = new Error(errorMessage, { cause })
      error.name = 'ChunkLoadError'

      // Cache the failure promise, future requests will also get this same rejection
      entry = Promise.reject(error)
    }
    chunkCache.set(chunkPath, entry)
  }
  // TODO: Return an instrumented Promise that React can use instead of relying on referential equality.
  return entry
}
contextPrototype.l = loadChunkAsync

function loadChunkAsyncByUrl<TModule extends Module>(
  this: TurbopackBaseContext<TModule>,
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

/**
 * Creates a Node.js worker thread by instantiating the given WorkerConstructor
 * with the appropriate path and options, including forwarded globals.
 *
 * @param WorkerConstructor The Worker constructor from worker_threads
 * @param workerPath Path to the worker entry chunk
 * @param workerOptions options to pass to the Worker constructor (optional)
 */
function createWorker(
  WorkerConstructor: { new (path: string, options?: object): unknown },
  workerPath: string,
  workerOptions?: { workerData?: unknown; [key: string]: unknown }
): unknown {
  // Build the forwarded globals object
  const forwardedGlobals: Record<string, unknown> = {}
  for (const name of WORKER_FORWARDED_GLOBALS) {
    forwardedGlobals[name] = (globalThis as Record<string, unknown>)[name]
  }

  // Merge workerData with forwarded globals
  const existingWorkerData = workerOptions?.workerData || {}
  const options = {
    ...workerOptions,
    workerData: {
      ...(typeof existingWorkerData === 'object' ? existingWorkerData : {}),
      __turbopack_globals__: forwardedGlobals,
    },
  }

  return new WorkerConstructor(workerPath, options)
}

const regexJsUrl = /\.js(?:\?[^#]*)?(?:#.*)?$/
/**
 * Checks if a given path/URL ends with .js, optionally followed by ?query or #fragment.
 */
function isJs(chunkUrlOrPath: ChunkUrl | ChunkPath): boolean {
  return regexJsUrl.test(chunkUrlOrPath)
}
