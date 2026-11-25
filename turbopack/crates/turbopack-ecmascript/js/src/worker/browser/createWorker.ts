// Embedded worker-runtime helper. This file is bundled as a regular module and
// `__turbopack_require__`d by the module containing the worker call. That module
// passes this helper's default export to its generated web-worker loader.
//
// The chunk-URL builder, the chunk base path and the asset suffix are read from
// the shared `__turbopack_chunk_relative_url__` / `__turbopack_chunk_base_path__`
// / `__turbopack_chunk_asset_suffix__` runtime primitives. The worker base-path
// override and forwarded-global names are baked into this module at build time by
// `turbopack-ecmascript` replacing the `_TURBOPACK_WORKER_BASE_PATH_` /
// `_TURBOPACK_WORKER_FORWARDED_GLOBALS_` free variables, and the forwarded-global
// values are read from `globalThis`.
declare const __turbopack_chunk_relative_url__: (
  chunkPath: string,
  basePath?: string
) => string

declare const __turbopack_chunk_base_path__: string
declare const __turbopack_chunk_asset_suffix__: string

// JS chunks already loaded in a worker runtime that is creating a nested worker.
// The nested chunk group omits factories already available in its parent worker,
// so the child re-imports those chunks (functions cannot cross worker realms).
// A worker created by a page has a self-contained chunk group instead.
declare const __turbopack_get_loaded_chunk_paths__: (() => string[]) | undefined

declare const _TURBOPACK_WORKER_FORWARDED_GLOBALS_: string[]
declare const _TURBOPACK_WORKER_BASE_PATH_: string | null

type WorkerConstructor = new (url: URL, options?: object) => Worker

// Mirrors the runtime's `ChunkData`.
type WorkerChunkData = string | { path: string }

/**
 * Creates a web worker by instantiating the given WorkerConstructor with the
 * appropriate URL and options.
 *
 * The entrypoint is a pre-compiled worker runtime file. The params configure
 * which module chunks to load and which module to run as the entry point.
 *
 * The params are a JSON array of the following structure:
 * `[PRELOAD_CHUNK_URLS, TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, WORKER_CHUNK_BASE_PATH, ...workerForwardedGlobals values]`
 *
 * `PRELOAD_CHUNK_URLS` comes first because it is loaded first.
 *
 * @param WorkerConstructor The Worker or SharedWorker constructor
 * @param entrypoint path to the worker entrypoint chunk
 * @param moduleChunks list of module chunk paths to load
 * @param workerOptions options to pass to the Worker constructor (optional)
 */
function createWorker(
  WorkerConstructor: WorkerConstructor,
  entrypoint: string,
  moduleChunks: WorkerChunkData[],
  workerOptions?: object
): Worker {
  const isSharedWorker = WorkerConstructor.name === 'SharedWorker'

  // `WORKER_BASE_PATH` overrides `CHUNK_BASE_PATH` for the entrypoint and the
  // module chunks loaded inside the worker, keeping them same-origin to each
  // other when `CHUNK_BASE_PATH` (= `assetPrefix`) is a cross-origin CDN.
  // `null` falls back; an empty string is treated as a literal empty prefix.
  const workerBasePath =
    _TURBOPACK_WORKER_BASE_PATH_ ?? __turbopack_chunk_base_path__

  // The worker's own chunks. Kept in their original order (and reversed the
  // same way as before) so the shared runtime chunk — emitted last by
  // `evaluated_chunk_group` — ends up first and the bootstrap can `shift()` it
  // off to load it after everything else.
  const workerChunkPaths = moduleChunks.map((chunk) =>
    typeof chunk === 'string' ? chunk : chunk.path
  )
  const workerChunkSet = new Set(workerChunkPaths)

  // Only a worker created by another worker inherits availability. A worker
  // created by a page has a self-contained chunk group and must not import all
  // the page's JS chunks. Workers have no `document`, including shared workers.
  // Nested workers re-import their parent's chunks because module factories
  // cannot be transferred across realms.
  //
  // These must be registered *before* the worker's own chunks, for two reasons:
  //  1. The worker's evaluate chunk instantiates the entry module, whose
  //     factory may live in one of these chunks.
  //  2. A worker loader has the same module id in every chunk group (its ident
  //     deliberately excludes availability info), but carries a different chunk
  //     list per group. Loading the worker's own chunks last means its version
  //     wins, so a nested worker gets the correctly-pruned chunk list.
  // They travel in their own params slot — first, since they load first.
  const preloadChunkPaths = (
    typeof document === 'undefined' &&
    typeof __turbopack_get_loaded_chunk_paths__ === 'function'
      ? __turbopack_get_loaded_chunk_paths__()
      : []
  ).filter((chunkPath) => !workerChunkSet.has(chunkPath))

  const chunkUrls = workerChunkPaths
    .map((chunkPath) =>
      __turbopack_chunk_relative_url__(chunkPath, workerBasePath)
    )
    .reverse()
  const preloadUrls = preloadChunkPaths.map((chunkPath) =>
    __turbopack_chunk_relative_url__(chunkPath, workerBasePath)
  )
  const params: unknown[] = [
    preloadUrls,
    chunkUrls,
    __turbopack_chunk_asset_suffix__,
    workerBasePath,
  ]
  const globals = _TURBOPACK_WORKER_FORWARDED_GLOBALS_
  for (let i = 0; i < globals.length; i++) {
    params.push((globalThis as Record<string, unknown>)[globals[i]])
  }

  const url = new URL(
    __turbopack_chunk_relative_url__(entrypoint, workerBasePath),
    location.origin
  )
  const paramsJson = JSON.stringify(params)
  if (isSharedWorker) {
    url.searchParams.set('params', paramsJson)
  } else {
    url.hash = '#params=' + encodeURIComponent(paramsJson)
  }

  // Remove type: "module" from options since our worker entrypoint is not a module
  const options = workerOptions
    ? { ...workerOptions, type: undefined }
    : undefined
  return new WorkerConstructor(url, options)
}

/**
 * Returns a function that calls `createWorker()` with the constructor and options.
 * The generated loader supplies `entrypoint` and `moduleChunks` when the originating
 * module calls it with this helper's default export, constructor, and options.
 */
export default function generateCreateWorker(
  entrypoint: string,
  moduleChunks: WorkerChunkData[]
) {
  return (
    WorkerConstructor: { new (url: URL, options?: object): Worker },
    workerOptions?: object
  ) => createWorker(WorkerConstructor, entrypoint, moduleChunks, workerOptions)
}
