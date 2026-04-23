/**
 * Node.js worker creation module.
 * Only included when a Node.js worker_threads Worker is actually used.
 */

'use turbopack no side effects'

/**
 * Creates a Node.js worker thread by instantiating the given WorkerConstructor
 * with the appropriate path and options, including forwarded globals.
 *
 * @param WorkerConstructor The Worker constructor from worker_threads
 * @param workerPath Path to the worker entry chunk
 * @param workerOptions options to pass to the Worker constructor (optional)
 */
export function createWorker(
  WorkerConstructor: { new (path: string, options?: object): unknown },
  workerPath: string,
  workerOptions?: { workerData?: unknown; [key: string]: unknown }
): unknown {
  // Build the forwarded globals object
  const forwardedGlobals: Record<string, unknown> = {}
  for (const name of __turbopack_forwarded_globals__()) {
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
