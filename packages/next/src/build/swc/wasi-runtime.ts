import { availableParallelism } from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'

import type {
  ThreadManager as EmnapiThreadManager,
  WorkerLike as EmnapiWorkerLike,
} from '@emnapi/wasi-threads'

const WASM_PAGE_SIZE_BYTES = 65_536
// 512 MiB. Keep in sync with --initial-memory in .cargo/config.toml.
export const WASI_MEMORY_INITIAL_PAGES = 536_870_912 / WASM_PAGE_SIZE_BYTES
// 4 GiB. Keep in sync with --max-memory in .cargo/config.toml.
export const WASI_MEMORY_MAXIMUM_PAGES = 4_294_967_296 / WASM_PAGE_SIZE_BYTES
const PARALLELISM_ENV = 'TURBO_TASKS_AVAILABLE_PARALLELISM'

export type WasiThreadWorkerData = {
  threadIds: Int32Array
  wasiThreadsModuleSpecifier: string
  [key: string]: unknown
}

type ThreadManagerConstructor = typeof EmnapiThreadManager

type WorkerConstructor = new (
  filename: string,
  options: {
    workerData: WasiThreadWorkerData
    stdout: false
    stderr: false
  }
) => EmnapiWorkerLike

/** Pass Node's effective CPU allowance into Rust before WASI constructors run. */
export function createWasiEnvironment(
  env: Record<string, string> = {},
  detectedParallelism = availableParallelism()
) {
  return {
    [PARALLELISM_ENV]: String(env[PARALLELISM_ENV] ?? detectedParallelism),
    ...env,
  }
}

/** Create the shared memory configured by the wasm32-wasip1-threads linker flags. */
export function createImportedMemory() {
  return new WebAssembly.Memory({
    initial: WASI_MEMORY_INITIAL_PAGES,
    maximum: WASI_MEMORY_MAXIMUM_PAGES,
    shared: true,
  })
}

function memoryView(
  memory: WebAssembly.Memory,
  pointer: number,
  length: number,
  purpose: string
) {
  if (
    !Number.isSafeInteger(pointer) ||
    !Number.isSafeInteger(length) ||
    pointer < 0 ||
    length < 0 ||
    pointer + length > memory.buffer.byteLength
  ) {
    throw new RangeError(`${purpose} is outside WebAssembly memory`)
  }
  return new Uint8Array(memory.buffer, pointer, length)
}

/**
 * Implement the two-phase `env.read_custom_section` contract documented by `link-section`.
 *
 * https://github.com/mmastrac/linktime/blob/ae29e51d94a955df2442ed6418b8a712c1f2bfb3/link-section/docs/PREAMBLE.md#wasm
 */
export function createReadCustomSection(
  module: WebAssembly.Module,
  memory: WebAssembly.Memory
) {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  return (
    namePtr: number,
    nameLength: number,
    targetPtr: number,
    targetLength: number
  ) => {
    const sectionName = decoder.decode(
      Uint8Array.from(memoryView(memory, namePtr, nameLength, 'section name'))
    )
    const sections = WebAssembly.Module.customSections(module, sectionName)
    if (sections.length === 0) return 0
    if (sections.length !== 1) {
      throw new Error(
        `custom section ${JSON.stringify(sectionName)} is ambiguous`
      )
    }

    const section = new Uint8Array(sections[0])
    if (targetLength < section.byteLength) return section.byteLength
    memoryView(
      memory,
      targetPtr,
      section.byteLength,
      'custom section target'
    ).set(section)
    return section.byteLength
  }
}

/** Atomically allocate IDs shared by the main instance and every Worker-owned manager. */
export function nextThreadId(threadIds: Int32Array) {
  if (
    threadIds.length !== 1 ||
    !(threadIds.buffer instanceof SharedArrayBuffer)
  ) {
    throw new TypeError('threadIds must be a one-element shared Int32Array')
  }
  const threadId = Atomics.add(threadIds, 0, 1) + 1
  if (threadId <= 0) {
    throw new RangeError('wasi thread id counter overflowed')
  }
  return threadId
}

/**
 * Create the old one-argument `wasi.thread-spawn` ABI over `@emnapi/wasi-threads` primitives.
 *
 * The package's high-level wrapper calls guest `malloc`/`free` for this ABI, but Rust test binaries
 * do not export them. A local manager per Worker also permits recursive spawning while the main wasm
 * thread is parked; all managers share one atomic ID counter.
 */
export async function createThreadRuntime(options: {
  module: WebAssembly.Module
  memory: WebAssembly.Memory
  threadIds: Int32Array
  workerData?: Record<string, unknown>
  workerPath?: string
  wasiThreadsModuleSpecifier?: string
  onError: (error: Error, threadId: number | undefined) => void
  beforeLoad?: (worker: EmnapiWorkerLike) => void
  WorkerClass?: WorkerConstructor
  ThreadManagerClass?: ThreadManagerConstructor
}): Promise<{
  threadSpawn: (startArg: number) => number
  manager: EmnapiThreadManager
}> {
  const {
    module,
    memory,
    threadIds,
    workerData = {},
    workerPath = path.join(__dirname, 'wasi-loader-worker.js'),
    wasiThreadsModuleSpecifier = '@emnapi/wasi-threads',
    onError,
    beforeLoad,
    WorkerClass = Worker as unknown as WorkerConstructor,
  } = options
  const ThreadManagerClass =
    options.ThreadManagerClass ??
    ((await import(wasiThreadsModuleSpecifier))
      .ThreadManager as ThreadManagerConstructor)

  class SharedIdThreadManager extends ThreadManagerClass {
    override markId(worker: EmnapiWorkerLike) {
      if (worker.__emnapi_tid !== undefined) return worker.__emnapi_tid
      const threadId = nextThreadId(threadIds)
      this.pthreads[threadId] = worker
      worker.__emnapi_tid = threadId
      return threadId
    }
  }

  const manager = new SharedIdThreadManager({
    reuseWorker: false,
    onCreateWorker: () => {
      const worker = new WorkerClass(workerPath, {
        workerData: {
          ...workerData,
          threadIds,
          wasiThreadsModuleSpecifier,
        },
        stdout: false,
        stderr: false,
      })
      // emnapi delivers async-work and thread-safe-function completions through messages from the
      // pthread Worker. The listener must exist before ThreadManager sends its `load` message or a
      // fast completion can be lost and the JavaScript Promise will never settle.
      beforeLoad?.(worker)
      return worker
    },
    printErr: (message) => onError(new Error(String(message)), undefined),
  })
  manager.init()
  // ThreadManager structured-clones the already-compiled module in its `load` message.
  manager.setup(module, memory)

  const threadSpawn = (startArg: number) => {
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
      if ('unref' in worker) worker.unref()
      return threadId
    } catch (error) {
      onError(
        error instanceof Error ? error : new Error(String(error)),
        undefined
      )
      return -1
    }
  }

  manager.threadSpawn = threadSpawn
  return { threadSpawn, manager }
}
