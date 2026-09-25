/**
 * Instantiation hooks for a `wasm32-wasip1-threads` build of the native bindings.
 *
 * Such a module cannot be instantiated by a stock WASI runtime: `turbo-tasks` collects its task
 * registries with `link-section`, whose wasm host contract requires `env.read_custom_section`, and
 * Node's WASI implementation does not provide the wasi-threads proposal's `wasi.thread-spawn`
 * import. The common host support lives in `./wasi-runtime`; `scripts/wasi-test-host/` consumes the
 * compiled copy so the production loader and test runner cannot drift.
 *
 * `next build --wasi` uses this N-API/WASI host. It is intentionally separate from the legacy
 * SWC-only wasm-bindgen fallback in `./index.ts` because the two bindings have different ABIs and
 * capabilities.
 */

import path from 'node:path'
import { WASI } from 'node:wasi'

import {
  createImportedMemory,
  createReadCustomSection,
  createThreadRuntime,
  createWasiEnvironment,
  nextThreadId,
  WASI_MEMORY_INITIAL_PAGES,
  WASI_MEMORY_MAXIMUM_PAGES,
  type WasiThreadWorkerData as RuntimeWorkerData,
} from './wasi-runtime'

export {
  createImportedMemory,
  createReadCustomSection,
  createThreadRuntime,
  createWasiEnvironment,
  nextThreadId,
  WASI_MEMORY_INITIAL_PAGES,
  WASI_MEMORY_MAXIMUM_PAGES,
}

type ImportNamespace = Record<string, WebAssembly.ImportValue>

export type NapiModuleLike = {
  imports: WebAssembly.Imports
  emnapi: {
    addSendListener(worker: unknown): boolean
  }
  init(options: {
    instance: WebAssembly.Instance
    module: WebAssembly.Module
    memory: WebAssembly.Memory
  }): void
}

export type WasiLike = {
  getImportObject(): object
  initialize(instance: WebAssembly.Instance): void
}

type WasiConstructor = new (options: {
  version: 'preview1'
  args: string[]
  env: Record<string, string>
  preopens: Record<string, string>
  returnOnExit: true
}) => WasiLike

export type WasiThreadWorkerData = RuntimeWorkerData & {
  args: string[]
  env: Record<string, string>
  preopens: Record<string, string>
  workerPath: string
  napiModuleSpecifier: string
}

/**
 * napi-sys imports N-API symbols from env, while @emnapi/core exposes them in its napi namespace.
 * Alias those functions into env and add the WASI hooks.
 */
export function createWasiImportObject(options: {
  module: WebAssembly.Module
  memory: WebAssembly.Memory
  napiImports: WebAssembly.Imports
  wasiImports: object
  threadSpawn: (startArg: number) => number
}): WebAssembly.Imports {
  const { module, memory, napiImports, threadSpawn } = options
  const wasiImports = options.wasiImports as WebAssembly.Imports
  const napi = (napiImports.napi ?? {}) as ImportNamespace
  const napiEnv = (napiImports.env ?? {}) as ImportNamespace
  const wasiThreads = (wasiImports.wasi ?? {}) as ImportNamespace

  return {
    ...napiImports,
    ...wasiImports,
    env: {
      ...napi,
      ...napiEnv,
      memory,
      read_custom_section: createReadCustomSection(module, memory),
    },
    wasi: {
      ...wasiThreads,
      'thread-spawn': threadSpawn,
    },
  }
}

/** Populate napi-rs's wasm-side export registry before `napiModule.init()` consumes it. */
export function registerNapiExports(instance: WebAssembly.Instance) {
  for (const [name, register] of Object.entries(instance.exports)) {
    if (name.startsWith('__napi_register__')) {
      if (typeof register !== 'function') {
        throw new TypeError(`${name} must be a WebAssembly function`)
      }
      register()
    }
  }
}

/** Bind WASI for a worker without rerunning process initialization.
 *
 * `WASI#initialize` rejects a command's `_start` and invokes a reactor's `_initialize`; both entry
 * points belong to the main instance. A spawned thread hides both while binding WASI, then
 * `ThreadMessageHandler` enters through `wasi_thread_start`. This is especially important now that
 * `_initialize` constructs the process-wide Tokio runtime.
 */
export function initializeWasiThread(
  wasi: WasiLike,
  instance: WebAssembly.Instance
) {
  const threadStart = instance.exports.wasi_thread_start
  if (typeof threadStart !== 'function') {
    throw new Error('spawned wasm instance does not export wasi_thread_start')
  }
  const threadExports = { ...instance.exports }
  delete threadExports._start
  delete threadExports._initialize
  wasi.initialize({ exports: threadExports } as WebAssembly.Instance)
  return threadStart
}

export async function instantiateWasiNapiModule(options: {
  bytes: Uint8Array
  napiModule: NapiModuleLike
  args?: string[]
  env?: Record<string, string>
  preopens?: Record<string, string>
  onThreadError: (error: Error, threadId: number | undefined) => void
  workerPath?: string
  napiModuleSpecifier?: string
  wasiThreadsModuleSpecifier?: string
  WasiClass?: WasiConstructor
}) {
  const { bytes, napiModule } = options
  const args = options.args ?? []
  const env = createWasiEnvironment(options.env)
  const preopens = options.preopens ?? {}
  const workerPath =
    options.workerPath ?? path.join(__dirname, 'wasi-loader-worker.js')
  const napiModuleSpecifier = options.napiModuleSpecifier ?? '@emnapi/core'
  const wasiThreadsModuleSpecifier =
    options.wasiThreadsModuleSpecifier ?? '@emnapi/wasi-threads'
  const WasiClass = options.WasiClass ?? WASI
  const wasi = new WasiClass({
    version: 'preview1',
    args,
    env,
    preopens,
    returnOnExit: true,
  })

  const module = await WebAssembly.compile(Uint8Array.from(bytes))
  const memory = createImportedMemory()
  const threadIds = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  )
  const { threadSpawn } = await createThreadRuntime({
    module,
    memory,
    threadIds,
    workerPath,
    wasiThreadsModuleSpecifier,
    workerData: {
      args,
      env,
      preopens,
      workerPath,
      napiModuleSpecifier,
    },
    onError: options.onThreadError,
    beforeLoad: (worker) => napiModule.emnapi.addSendListener(worker),
  })
  const imports = createWasiImportObject({
    module,
    memory,
    napiImports: napiModule.imports,
    wasiImports: wasi.getImportObject(),
    threadSpawn,
  })
  const instance = await WebAssembly.instantiate(module, imports)
  wasi.initialize(instance)
  registerNapiExports(instance)
  napiModule.init({ instance, module, memory })
  return { instance, module, memory, threadIds }
}
