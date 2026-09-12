/**
 * `wasi.thread-spawn` over `node:worker_threads`.
 *
 * Shared by the main module and by every spawned thread, because a thread may itself spawn threads:
 * a Tokio multi-thread runtime does exactly that. A worker therefore creates its own workers
 * directly rather than asking the main thread to do it — the main thread is usually parked in
 * `Atomics.wait` inside wasm and cannot run its event loop to service such a request.
 */

import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

const THREAD_WORKER = fileURLToPath(new URL('./thread.mjs', import.meta.url))

/**
 * Allocate thread ids from one shared counter so ids stay unique across every thread that spawns.
 *
 * A plain JS variable would not do: each worker has its own module instance, so each would hand out
 * ids starting from the same value. `Atomics.add` on shared memory is the only counter all of them
 * can see.
 *
 * @param {Int32Array} threadIds a one-element `Int32Array` over a `SharedArrayBuffer`
 */
export function nextThreadId(threadIds) {
  // Main thread is 0; spawned threads start at 1.
  return Atomics.add(threadIds, 0, 1) + 1
}

/**
 * Build the `wasi.thread-spawn` implementation for one instance.
 *
 * Returns the new thread id, or a negative value if the thread could not be created, as the
 * wasi-threads proposal requires.
 *
 * @param {{ bytes: Uint8Array, memory: WebAssembly.Memory, threadIds: Int32Array, args: string[], cwd: string, onError: (error: Error, threadId: number) => void }} context
 */
export function createThreadSpawn(context) {
  const { bytes, memory, threadIds, args, cwd, onError } = context

  return function threadSpawn(startArg) {
    const threadId = nextThreadId(threadIds)
    try {
      const worker = new Worker(THREAD_WORKER, {
        workerData: { bytes, memory, threadIds, threadId, startArg, args, cwd },
        // Inherit stdio so panics and test output from threads reach the terminal.
        stdout: false,
        stderr: false,
      })
      let reported = false
      worker.on('error', (error) => {
        reported = true
        onError(error, threadId)
      })
      worker.on('exit', (code) => {
        // `process.exit(1)` in the worker produces an `exit` event, not an `error` event. Report it
        // as well, but don't double-report a thrown JS error (which emits both).
        if (code !== 0 && !reported) {
          onError(
            new Error(`wasi thread ${threadId} exited with code ${code}`),
            threadId
          )
        }
      })
      // Don't hold the process open: wasm threads outlive the JS event loop's interest in them, and
      // the wasm side decides when the program is finished.
      worker.unref()
      return threadId
    } catch (error) {
      onError(
        error instanceof Error ? error : new Error(String(error)),
        threadId
      )
      return -1
    }
  }
}
