/**
 * Browser worker creation module.
 * Only included when a Web Worker or SharedWorker is actually used.
 */

'use turbopack no side effects'

/**
 * Creates a worker by instantiating the given WorkerConstructor with the
 * appropriate URL and options.
 *
 * The entrypoint is a pre-compiled worker runtime file. The params configure
 * which module chunks to load and which module to run as the entry point.
 *
 * The params are a JSON array of the following structure:
 * `[TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, ...WORKER_FORWARDED_GLOBALS values]`
 *
 * @param WorkerConstructor The Worker or SharedWorker constructor
 * @param entrypoint URL path to the worker entrypoint chunk
 * @param moduleChunks list of module chunk paths to load
 * @param workerOptions options to pass to the Worker constructor (optional)
 */
export function createWorker(
  WorkerConstructor: { new (url: URL, options?: object): Worker },
  entrypoint: string,
  moduleChunks: string[],
  workerOptions?: object
): Worker {
  const isSharedWorker = WorkerConstructor.name === 'SharedWorker'

  const chunkUrls = moduleChunks
    .map((chunk) => __turbopack_chunk_url__(chunk))
    .reverse()
  const params: unknown[] = [chunkUrls, __turbopack_asset_suffix__()]
  for (const globalName of __turbopack_forwarded_globals__()) {
    params.push((globalThis as Record<string, unknown>)[globalName])
  }

  const url = new URL(__turbopack_chunk_url__(entrypoint), location.origin)
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
