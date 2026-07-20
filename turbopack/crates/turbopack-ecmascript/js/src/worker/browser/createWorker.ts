// Embedded worker-runtime helper. This file is bundled as a regular module and
// `__turbopack_require__`d by the generated web-worker loader code.
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

declare const _TURBOPACK_WORKER_FORWARDED_GLOBALS_: string[]
declare const _TURBOPACK_WORKER_BASE_PATH_: string | null

type WorkerConstructor = new (url: URL, options?: object) => Worker

/**
 * Creates a web worker by instantiating the given WorkerConstructor with the
 * appropriate URL and options.
 *
 * The entrypoint is a pre-compiled worker runtime file. The params configure
 * which module chunks to load and which module to run as the entry point.
 *
 * The params are a JSON array of the following structure:
 * `[TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, ...workerForwardedGlobals values]`
 *
 * @param WorkerConstructor The Worker or SharedWorker constructor
 * @param entrypoint path to the worker entrypoint chunk
 * @param moduleChunks list of module chunk paths to load
 * @param workerOptions options to pass to the Worker constructor (optional)
 */
function createWorker(
  WorkerConstructor: WorkerConstructor,
  entrypoint: string,
  moduleChunks: string[],
  workerOptions?: object
): Worker {
  const isSharedWorker = WorkerConstructor.name === 'SharedWorker'

  // `WORKER_BASE_PATH` overrides `CHUNK_BASE_PATH` for the entrypoint and the
  // module chunks loaded inside the worker, keeping them same-origin to each
  // other when `CHUNK_BASE_PATH` (= `assetPrefix`) is a cross-origin CDN.
  // `null` falls back; an empty string is treated as a literal empty prefix.
  const workerBasePath =
    _TURBOPACK_WORKER_BASE_PATH_ ?? __turbopack_chunk_base_path__

  const chunkUrls = moduleChunks
    .map((chunk) => __turbopack_chunk_relative_url__(chunk, workerBasePath))
    .reverse()
  const params: unknown[] = [chunkUrls, __turbopack_chunk_asset_suffix__]
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
 * Returns a function, that when called with the constructor + any options calls `createWorker()`.
 * The worker configuration (`entrypoint`, `moduleChunks`) is passed by `turbopack-ecmascript`
 * at build time, leaving the runtime caller to only supply the constructor and options.
 */
export default function generateCreateWorker(
  entrypoint: string,
  moduleChunks: string[]
) {
  return (
    WorkerConstructor: { new (url: URL, options?: object): Worker },
    workerOptions?: object
  ) => createWorker(WorkerConstructor, entrypoint, moduleChunks, workerOptions)
}
