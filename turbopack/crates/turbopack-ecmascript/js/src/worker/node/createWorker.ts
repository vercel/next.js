// Embedded worker-runtime helper. This file is bundled as a regular module and
// `__turbopack_require__`d by the generated Node.js worker-thread loader code.
//
// The list of globals to forward is baked into this module at build time by
// `turbopack-ecmascript` replacing the `_TURBOPACK_WORKER_FORWARDED_GLOBALS_`
// free variable; the forwarded-global values are read from `globalThis`.
declare const _TURBOPACK_WORKER_FORWARDED_GLOBALS_: string[]

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
  const globals = _TURBOPACK_WORKER_FORWARDED_GLOBALS_
  for (let i = 0; i < globals.length; i++) {
    forwardedGlobals[globals[i]] = (globalThis as Record<string, unknown>)[
      globals[i]
    ]
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

/**
 * Returns a function, that when called with the constructor + any options calls `createWorker()`.
 * The worker configuration (`entrypoint`) is passed by `turbopack-ecmascript` at build time,
 * leaving the runtime caller to only supply the constructor and options.
 */
export default function generateCreateWorker(entrypoint: string) {
  return (
    WorkerConstructor: { new (path: string, options?: object): unknown },
    workerOptions?: { workerData?: unknown; [key: string]: unknown }
  ) => createWorker(WorkerConstructor, entrypoint, workerOptions)
}
