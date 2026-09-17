/**
 * Instantiation hooks for a `wasm32-wasip1-threads` build of the native bindings.
 *
 * Such a module cannot be instantiated by a stock WASI runtime: `turbo-tasks` collects its task
 * registries with `link-section`, whose wasm host contract requires `env.read_custom_section`, and
 * Node's WASI implementation does not provide the wasi-threads proposal's `wasi.thread-spawn`
 * import. The common host support lives in `./wasi-runtime`; `scripts/wasi-test-host/` consumes the
 * compiled copy so the production loader and test runner cannot drift.
 *
 * This is groundwork only — nothing here is wired into the SWC-only wasm fallback in `./index.ts`,
 * and `module_init` (absent on wasm) and packaging are deliberately out of scope, so loading
 * Turbopack from wasm does not work yet.
 */

import path from 'node:path'

import {
  createImportedMemory,
  createReadCustomSection,
  createThreadRuntime,
  createWasiEnvironment,
  nextThreadId,
  parseImportedMemory,
  type ImportedMemory,
  type WasiThreadWorkerData as RuntimeWorkerData,
} from './wasi-runtime'

export {
  createImportedMemory,
  createReadCustomSection,
  createThreadRuntime,
  createWasiEnvironment,
  nextThreadId,
  parseImportedMemory,
  type ImportedMemory,
}

type ImportNamespace = Record<string, WebAssembly.ImportValue>

export type NapiModuleLike = {
  imports: WebAssembly.Imports
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

/**
 * Bind WASI for a worker without running the command-only `_start` export.
 *
 * `WASI#initialize` rejects a command exporting `_start`, which must run exactly once on the main
 * thread. `ThreadMessageHandler` enters the bound instance through `wasi_thread_start` instead.
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
  wasi.initialize({ exports: threadExports } as WebAssembly.Instance)
  return threadStart
}

export async function instantiateWasiNapiModule(options: {
  bytes: Uint8Array
  napiModule: NapiModuleLike
  wasi: WasiLike
  args?: string[]
  env?: Record<string, string>
  preopens?: Record<string, string>
  onThreadError: (error: Error, threadId: number | undefined) => void
  workerPath?: string
  napiModuleSpecifier?: string
  wasiThreadsModuleSpecifier?: string
}) {
  const { bytes, napiModule, wasi } = options
  const args = options.args ?? []
  const env = options.env ?? {}
  const preopens = options.preopens ?? {}
  const workerPath =
    options.workerPath ?? path.join(__dirname, 'wasi-loader-worker.js')
  const napiModuleSpecifier = options.napiModuleSpecifier ?? '@emnapi/core'
  const wasiThreadsModuleSpecifier =
    options.wasiThreadsModuleSpecifier ?? '@emnapi/wasi-threads'

  const module = await WebAssembly.compile(Uint8Array.from(bytes))
  const memory = createImportedMemory(bytes)
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
  napiModule.init({ instance, module, memory })
  return { instance, module, memory, threadIds }
}
