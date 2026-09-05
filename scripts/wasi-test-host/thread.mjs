/**
 * Worker body for one `wasi.thread-spawn`ed thread.
 *
 * The thread instantiates the same module over the shared memory created by the main module, then
 * calls `wasi_thread_start(threadId, startArg)` — the entry point `wasm32-wasip1-threads` emits for
 * spawned threads.
 */

import { WASI } from 'node:wasi'
import { workerData } from 'node:worker_threads'
import process from 'node:process'

import { createReadCustomSection } from './lib.mjs'
import { createThreadSpawn } from './spawn.mjs'

const { bytes, memory, threadIds, threadId, startArg, args, cwd } = workerData

const module = await WebAssembly.compile(bytes)

const wasi = new WASI({
  version: 'preview1',
  args,
  env: process.env,
  preopens: { '/': cwd },
  returnOnExit: true,
})

const instance = await WebAssembly.instantiate(module, {
  ...wasi.getImportObject(),
  env: {
    memory,
    // Per-instance: the import is bound per instance even though the module and memory are shared.
    read_custom_section: createReadCustomSection(module, memory),
  },
  wasi: {
    // A spawned thread may spawn further threads — a Tokio multi-thread runtime does.
    'thread-spawn': createThreadSpawn({
      bytes,
      memory,
      threadIds,
      args,
      cwd,
      onError: (error, id) => {
        console.error(`wasi thread ${id} failed:`, error)
        process.exit(1)
      },
    }),
  },
})

// Bind the WASI instance to this thread's exports so the `wasi_snapshot_preview1` imports work.
//
// `initialize()` is the reactor-style entry point, and it rejects anything exporting `_start`
// ("The "instance.exports._start" property must be undefined") because that marks a command, whose
// `_start` must run exactly once — on the main thread. A spawned thread needs the WASI binding
// without that entry point, so it is hidden here; `wasi_thread_start` below is the thread's real
// entry point. Passing a plain `{ exports }` is enough for `initialize()`.
const threadExports = { ...instance.exports }
delete threadExports._start
wasi.initialize({ exports: threadExports })

try {
  instance.exports.wasi_thread_start(threadId, startArg)
} catch (error) {
  // A panic in a spawned thread aborts the instance (wasm has no unwinding). Report it here rather
  // than letting the worker die silently: the main thread is usually parked in `Atomics.wait` and
  // cannot run an 'error' handler to notice.
  console.error(`wasi thread ${threadId} aborted:`, error)
  process.exit(1)
}
