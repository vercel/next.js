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

// null = loaded successfully, Error = load failed (cached for future requests)
const loadedChunks = new Map<ChunkPath, Error | null>()

function clearChunkCache() {
  loadedChunks.clear()
}

/**
 * Synchronously loads a chunk using require(). Caches results so a chunk is
 * only loaded once; cached errors are re-thrown on subsequent calls.
 *
 * @param sourceId - identifier for error messages (chunk path or module id)
 * @param sourceIsModule - true: "from module {sourceId}", false: "from runtime for chunk {sourceId}"
 */
function loadChunkPath(
  chunkPath: ChunkPath,
  sourceId: ModuleId,
  sourceIsModule: boolean
): void {
  if (!isJs(chunkPath)) {
    // We only support loading JS chunks in Node.js.
    // This branch can be hit when trying to load a CSS chunk.
    return
  }

  const cached = loadedChunks.get(chunkPath)
  if (cached !== undefined) {
    if (cached !== null) throw cached
    return
  }

  try {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath)
    const chunkModules: CompressedModuleFactories = require(resolved)
    installCompressedModuleFactories(chunkModules, 0, moduleFactories)
    loadedChunks.set(chunkPath, null)
  } catch (cause) {
    const error = new Error(
      sourceIsModule
        ? `Failed to load chunk ${chunkPath} from module ${sourceId}`
        : `Failed to load chunk ${chunkPath} ${sourceId ? `from runtime for chunk ${sourceId}` : ''}`,
      { cause }
    )
    error.name = 'ChunkLoadError'
    // Don't cache runtime chunk loading errors
    if (!sourceIsModule) {
      loadedChunks.set(chunkPath, error)
    }
    throw error
  }
}

function loadRuntimeChunkPath(
  sourcePath: ChunkPath,
  chunkPath: ChunkPath
): void {
  loadChunkPath(chunkPath, sourcePath, false)
}

function loadChunkSync<TModule extends Module>(
  this: TurbopackBaseContext<TModule>,
  chunkData: ChunkData
): void {
  const chunkPath = typeof chunkData === 'string' ? chunkData : chunkData.path
  loadChunkPath(chunkPath, this.m.id, true)
}
contextPrototype.l = loadChunkSync

function loadChunkSyncByUrl<TModule extends Module>(
  this: TurbopackBaseContext<TModule>,
  chunkUrl: string
) {
  const chunkPath = url.fileURLToPath(
    new URL(chunkUrl, RUNTIME_ROOT)
  ) as ChunkPath
  loadChunkSync.call(this, chunkPath)
}
contextPrototype.L = loadChunkSyncByUrl

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
