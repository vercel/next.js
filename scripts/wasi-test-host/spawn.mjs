/**
 * `wasi.thread-spawn` over `node:worker_threads`.
 *
 * V8 supports shared WebAssembly memory and atomics, but Node's WASI implementation only supplies
 * `wasi_snapshot_preview1`; it does not implement the `wasi.thread-spawn` host import from the
 * wasi-threads proposal. `@emnapi/wasi-threads` supplies the Worker lifecycle and transfers the
 * already-compiled module to each Worker.
 *
 * Spec: https://github.com/WebAssembly/wasi-threads
 */

import { ThreadManager } from '@emnapi/wasi-threads'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

const THREAD_WORKER = fileURLToPath(new URL('./thread.mjs', import.meta.url))

/**
 * Allocate thread ids from one shared counter so ids stay unique across every thread that spawns.
 *
 * A plain JS variable would not do: each Worker has its own module instance, so each would hand out
 * ids starting from the same value. `Atomics.add` on shared memory is the only counter all of them
 * can see.
 *
 * @param {Int32Array} threadIds a one-element `Int32Array` over a `SharedArrayBuffer`
 */
export function nextThreadId(threadIds) {
  if (
    threadIds.length !== 1 ||
    !(threadIds.buffer instanceof SharedArrayBuffer)
  ) {
    throw new TypeError('threadIds must be a one-element shared Int32Array')
  }
  // Main thread is 0; spawned threads start at 1.
  const threadId = Atomics.add(threadIds, 0, 1) + 1
  if (threadId <= 0) {
    throw new RangeError('wasi thread id counter overflowed')
  }
  return threadId
}

/**
 * Build a `wasi.thread-spawn` implementation and Worker manager for one instance.
 *
 * Rust currently imports the proposal's original one-argument ABI, which returns the new thread id
 * directly. `WASIThreads` supports that ABI by calling guest `malloc`/`free`, but Rust test binaries
 * do not export those functions. The lower-level manager and handler do not impose that requirement,
 * so this small adapter preserves the original ABI while delegating module transfer, load/start
 * ordering, cleanup, and Worker lifecycle to `@emnapi/wasi-threads`.
 *
 * Every Worker creates a local manager because a Tokio worker may itself spawn a thread while the
 * main wasm thread is parked in `Atomics.wait`. All managers allocate IDs from the same shared
 * counter.
 *
 * @param {{ module: WebAssembly.Module, memory: WebAssembly.Memory, threadIds: Int32Array, args: string[], env: Record<string, string>, preopens: Record<string, string>, onError: (error: Error, threadId: number | undefined) => void, workerPath?: string, WorkerClass?: typeof Worker, ThreadManagerClass?: typeof ThreadManager }} context
 */
export function createThreadRuntime(context) {
  const {
    module,
    memory,
    threadIds,
    args,
    env,
    preopens,
    onError,
    workerPath = THREAD_WORKER,
    WorkerClass = Worker,
    ThreadManagerClass = ThreadManager,
  } = context

  class SharedIdThreadManager extends ThreadManagerClass {
    markId(worker) {
      if (worker.__emnapi_tid !== undefined) return worker.__emnapi_tid
      const threadId = nextThreadId(threadIds)
      this.pthreads[threadId] = worker
      worker.__emnapi_tid = threadId
      return threadId
    }
  }

  const manager = new SharedIdThreadManager({
    reuseWorker: false,
    onCreateWorker: () =>
      new WorkerClass(workerPath, {
        workerData: { threadIds, args, env, preopens },
        // Inherit stdio so panics and test output from threads reach the terminal.
        stdout: false,
        stderr: false,
      }),
    printErr: (message) => onError(new Error(String(message)), undefined),
  })
  manager.init()
  // `ThreadManager` posts these structured-cloneable values in its `load` message. In particular,
  // Workers receive the compiled module rather than the original bytes, so they only instantiate.
  manager.setup(module, memory)

  const threadSpawn = (startArg) => {
    try {
      const worker = manager.getNewWorker()
      if (!worker) return -1
      const threadId = manager.markId(worker)
      worker.postMessage({
        __emnapi__: {
          type: 'start',
          payload: { tid: threadId, arg: startArg },
        },
      })
      worker.unref()
      return threadId
    } catch (error) {
      onError(
        error instanceof Error ? error : new Error(String(error)),
        undefined
      )
      return -1
    }
  }

  // The package calls this callback if a child-mode handler asks its owner to spawn. Our workers
  // normally own local managers instead, but keeping the callback set makes the manager complete.
  manager.threadSpawn = threadSpawn
  return { threadSpawn, manager }
}
