import process from 'node:process'
import { WASI } from 'node:wasi'
import { parentPort, workerData } from 'node:worker_threads'

import {
  createThreadSpawn,
  createWasiImportObject,
  initializeWasiThread,
  type NapiModuleLike,
  type WasiThreadWorkerData,
} from './wasi-loader'

async function runThread(data: WasiThreadWorkerData) {
  const module = await WebAssembly.compile(Uint8Array.from(data.bytes))
  const wasi = new WASI({
    version: 'preview1',
    args: data.args,
    env: data.env,
    preopens: data.preopens,
    returnOnExit: true,
  })

  // Packaging decides where @emnapi/core is resolved from. Keeping this as a
  // runtime specifier lets the eventual wasm package provide it without making
  // it a dependency of next itself.
  const emnapi = await import(data.napiModuleSpecifier)
  const napiModule = emnapi.createNapiModule({
    childThread: true,
    postMessage: (message: unknown) => parentPort?.postMessage(message),
  }) as NapiModuleLike

  const threadSpawn = createThreadSpawn({
    bytes: data.bytes,
    memory: data.memory,
    threadIds: data.threadIds,
    args: data.args,
    env: data.env,
    preopens: data.preopens,
    workerPath: data.workerPath,
    napiModuleSpecifier: data.napiModuleSpecifier,
    onError(error, threadId) {
      console.error(`wasi thread ${threadId} failed:`, error)
      process.exitCode = 1
    },
  })
  const imports = createWasiImportObject({
    module,
    memory: data.memory,
    napiImports: napiModule.imports,
    wasiImports: wasi.getImportObject(),
    threadSpawn,
  })
  const instance = await WebAssembly.instantiate(module, imports)
  const threadStart = initializeWasiThread(wasi, instance)
  napiModule.init({ instance, module, memory: data.memory })
  threadStart(data.threadId, data.startArg)
}

runThread(workerData as WasiThreadWorkerData).catch((error) => {
  console.error('wasi thread failed to initialize:', error)
  process.exitCode = 1
})
