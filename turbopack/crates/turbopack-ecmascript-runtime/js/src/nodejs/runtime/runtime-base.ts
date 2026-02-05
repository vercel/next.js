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

// Use global module factories and cache to persist across chunk reloads during HMR
// This ensures that when Node.js clears the require cache for a chunk file,
// we don't lose our granular HMR updates to individual modules
if (!globalThis.__turbopack_module_factories__) {
  globalThis.__turbopack_module_factories__ = new Map()
}
if (!globalThis.__turbopack_module_cache__) {
  globalThis.__turbopack_module_cache__ = new Map()
}

const moduleFactories: ModuleFactories =
  globalThis.__turbopack_module_factories__

// Module cache - typed as base Module, can be cast to HotModule in dev mode
const moduleCache: ModuleCache<Module> = globalThis.__turbopack_module_cache__

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

/**
 * Clear all chunk and module state to force re-evaluation on next require.
 * Called by Next.js when server HMR is disabled to implement the "reload everything" behavior.
 */
function clearChunkCache() {
  chunkCache.clear()
  loadedChunks.clear()
  moduleFactories.clear()
  moduleCache.clear()
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

function loadChunkAsync(
  this: TurbopackBaseContext<any>,
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

function loadChunkAsyncByUrl(
  this: TurbopackBaseContext<any>,
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

function getWorkerURL(
  _entrypoint: ChunkPath,
  _moduleChunks: ChunkPath[],
  _shared: boolean
): URL {
  throw new Error('Worker urls are not implemented yet for Node.js')
}

const regexJsUrl = /\.js(?:\?[^#]*)?(?:#.*)?$/
/**
 * Checks if a given path/URL ends with .js, optionally followed by ?query or #fragment.
 */
function isJs(chunkUrlOrPath: ChunkUrl | ChunkPath): boolean {
  return regexJsUrl.test(chunkUrlOrPath)
}
