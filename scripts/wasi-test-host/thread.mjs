/**
 * Worker body for one `wasi.thread-spawn`ed thread.
 *
 * `@emnapi/wasi-threads` sends the compiled module and shared memory in a `load` message, then queues
 * the `start` message until instantiation finishes. No Worker recompiles the wasm bytes.
 */

import { ThreadMessageHandler } from '@emnapi/wasi-threads'
import process from 'node:process'
import { WASI } from 'node:wasi'
import { parentPort, workerData } from 'node:worker_threads'

import { createReadCustomSection } from './lib.mjs'
import { createThreadRuntime } from './spawn.mjs'

const { threadIds, args, env, preopens } = workerData

const handler = new ThreadMessageHandler({
  postMessage: (message) => parentPort.postMessage(message),
  onError: (error, type) => {
    console.error(`wasi thread failed during ${type}:`, error)
    process.exit(1)
  },
  async onLoad({ wasmModule, wasmMemory }) {
    const wasi = new WASI({
      version: 'preview1',
      args,
      env,
      preopens,
      returnOnExit: true,
    })

    // A Tokio worker may itself spawn blocking workers. Give every instance a local manager so that
    // nested spawning does not depend on the main JS event loop while the main wasm thread is parked.
    const { threadSpawn } = createThreadRuntime({
      module: wasmModule,
      memory: wasmMemory,
      threadIds,
      args,
      env,
      preopens,
      onError: (error, threadId) => {
        const suffix = threadId === undefined ? '' : ` ${threadId}`
        console.error(`wasi thread${suffix} failed:`, error)
        process.exit(1)
      },
    })

    const instance = await WebAssembly.instantiate(wasmModule, {
      ...wasi.getImportObject(),
      env: {
        memory: wasmMemory,
        read_custom_section: createReadCustomSection(wasmModule, wasmMemory),
      },
      wasi: {
        'thread-spawn': threadSpawn,
      },
    })

    // Bind preview1 imports without invoking the command's `_start`; ThreadMessageHandler enters the
    // instance through `wasi_thread_start` when it processes the queued `start` message.
    const threadExports = { ...instance.exports }
    delete threadExports._start
    wasi.initialize({ exports: threadExports })
    return { module: wasmModule, instance }
  },
})

parentPort.on('message', (data) => handler.handle({ data }))
