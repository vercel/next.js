/** Worker body for one `wasi.thread-spawn`ed test thread. */

import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { WASI } from 'node:wasi'
import { parentPort, workerData } from 'node:worker_threads'

import { createReadCustomSection } from './lib.mjs'
import { createThreadRuntime } from './spawn.mjs'

const { threadIds, wasiThreadsModuleSpecifier, args, env, preopens } =
  workerData
const { ThreadMessageHandler } = await import(wasiThreadsModuleSpecifier)
const THREAD_WORKER = fileURLToPath(new URL('./thread.mjs', import.meta.url))

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
    const { threadSpawn } = await createThreadRuntime({
      module: wasmModule,
      memory: wasmMemory,
      threadIds,
      workerData: { args, env, preopens },
      workerPath: THREAD_WORKER,
      wasiThreadsModuleSpecifier,
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
      wasi: { 'thread-spawn': threadSpawn },
    })

    // Hide process constructors before binding WASI. `ThreadMessageHandler` enters only through
    // `wasi_thread_start`, so workers neither rerun `_start` nor create another Tokio runtime.
    const threadExports = { ...instance.exports }
    delete threadExports._start
    delete threadExports._initialize
    wasi.initialize({ exports: threadExports })
    return { module: wasmModule, instance }
  },
})

parentPort.on('message', (data) => handler.handle({ data }))
