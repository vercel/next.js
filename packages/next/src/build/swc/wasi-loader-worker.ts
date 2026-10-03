import process from 'node:process'
import { WASI } from 'node:wasi'
import { parentPort, workerData } from 'node:worker_threads'

import type { LoadPayload, WorkerMessageType } from '@emnapi/wasi-threads'

import {
  createWasiImportObject,
  initializeWasiThread,
  type NapiModuleLike,
  type WasiThreadWorkerData,
} from './wasi-loader'
import { createThreadRuntime } from './wasi-runtime'

async function listenForThreads(data: WasiThreadWorkerData) {
  const port = parentPort
  if (port === null) {
    throw new Error('WASI thread worker has no parent port')
  }

  // @emnapi/wasi-threads is ESM-only. Keep package resolution dynamic because the eventual wasm
  // package, like @emnapi/core, decides where this runtime dependency is provided.
  const { ThreadMessageHandler } = await import(data.wasiThreadsModuleSpecifier)
  const handler = new ThreadMessageHandler({
    postMessage: (message: unknown) => port.postMessage(message),
    onError(error: Error, type: WorkerMessageType) {
      console.error(`wasi thread failed during ${type}:`, error)
      process.exitCode = 1
    },
    async onLoad({ wasmModule, wasmMemory }: LoadPayload) {
      const wasi = new WASI({
        version: 'preview1',
        args: data.args,
        env: data.env,
        preopens: data.preopens,
        returnOnExit: true,
      })

      const emnapi = await import(data.napiModuleSpecifier)
      const napiModule = emnapi.createNapiModule({
        childThread: true,
        postMessage: (message: unknown) => port.postMessage(message),
      }) as NapiModuleLike

      // A Tokio worker may itself spawn blocking workers. Give each instance a local manager so
      // nested creation does not depend on the main event loop while the main wasm thread is parked.
      const { threadSpawn } = await createThreadRuntime({
        module: wasmModule,
        memory: wasmMemory,
        threadIds: data.threadIds,
        workerPath: data.workerPath,
        wasiThreadsModuleSpecifier: data.wasiThreadsModuleSpecifier,
        workerData: {
          args: data.args,
          env: data.env,
          preopens: data.preopens,
          workerPath: data.workerPath,
          napiModuleSpecifier: data.napiModuleSpecifier,
        },
        onError(error, threadId) {
          const suffix = threadId === undefined ? '' : ` ${threadId}`
          console.error(`wasi thread${suffix} failed:`, error)
          process.exitCode = 1
        },
        beforeLoad: (worker) => napiModule.emnapi.addSendListener(worker),
      })
      const imports = createWasiImportObject({
        module: wasmModule,
        memory: wasmMemory,
        napiImports: napiModule.imports,
        wasiImports: wasi.getImportObject(),
        threadSpawn,
      })
      const instance = await WebAssembly.instantiate(wasmModule, imports)
      initializeWasiThread(wasi, instance)
      napiModule.init({ instance, module: wasmModule, memory: wasmMemory })
      return { module: wasmModule, instance }
    },
  })

  port.on('message', (message) => handler.handle({ data: message }))
}

listenForThreads(workerData as WasiThreadWorkerData).catch((error) => {
  console.error('wasi thread failed to initialize:', error)
  process.exitCode = 1
})
