import { availableParallelism } from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'

import type {
  ThreadManager as EmnapiThreadManager,
  WorkerLike as EmnapiWorkerLike,
} from '@emnapi/wasi-threads'

const MAX_WASM32_PAGES = 65_536
const PARALLELISM_ENV = 'TURBO_TASKS_AVAILABLE_PARALLELISM'

export type ImportedMemory = {
  module: string
  name: string
  initial: number
  maximum: number | undefined
  shared: boolean
}

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

class WasmReader {
  private offset = 0
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  get position() {
    return this.offset
  }

  get done() {
    return this.offset === this.bytes.byteLength
  }

  seek(offset: number) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > this.bytes.length
    ) {
      throw new Error(
        'malformed wasm: section extends beyond the end of the binary'
      )
    }
    this.offset = offset
  }

  u8() {
    if (this.offset >= this.bytes.length) {
      throw new Error('malformed wasm: unexpected end of binary')
    }
    return this.bytes[this.offset++]
  }

  u32() {
    let result = 0
    let shift = 0
    for (let byteIndex = 0; byteIndex < 5; byteIndex++) {
      const byte = this.u8()
      if (byteIndex === 4 && (byte & 0xf0) !== 0) {
        throw new Error('malformed wasm: u32 LEB128 value is too large')
      }
      result += (byte & 0x7f) * 2 ** shift
      if ((byte & 0x80) === 0) return result
      shift += 7
    }
    throw new Error('malformed wasm: unterminated u32 LEB128 value')
  }

  name() {
    const length = this.u32()
    const end = this.offset + length
    if (!Number.isSafeInteger(end) || end > this.bytes.length) {
      throw new Error(
        'malformed wasm: name extends beyond the end of the binary'
      )
    }
    const value = new TextDecoder('utf-8', { fatal: true }).decode(
      this.bytes.subarray(this.offset, end)
    )
    this.offset = end
    return value
  }
}

function readLimits(reader: WasmReader) {
  const flags = reader.u32()
  if ((flags & ~0x07) !== 0) {
    throw new Error(
      `unsupported wasm memory limits flags 0x${flags.toString(16)}`
    )
  }
  if ((flags & 0x04) !== 0) {
    throw new Error('memory64 imports are not supported')
  }
  const initial = reader.u32()
  const maximum = (flags & 0x01) !== 0 ? reader.u32() : undefined
  return { initial, maximum, shared: (flags & 0x02) !== 0 }
}

/**
 * Read the limits omitted by `WebAssembly.Module.imports()` from a wasm binary's import section.
 *
 * https://developer.mozilla.org/docs/WebAssembly/Reference/JavaScript_interface/Module/imports_static
 * https://webassembly.github.io/spec/core/binary/modules.html#binary-importsec
 */
export function parseImportedMemory(bytes: Uint8Array): ImportedMemory {
  if (
    bytes.byteLength < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d ||
    bytes[4] !== 0x01 ||
    bytes[5] !== 0x00 ||
    bytes[6] !== 0x00 ||
    bytes[7] !== 0x00
  ) {
    throw new Error(
      'malformed wasm: expected the WebAssembly 1 magic and version'
    )
  }

  const reader = new WasmReader(bytes)
  reader.seek(8)
  while (!reader.done) {
    const sectionId = reader.u8()
    const sectionSize = reader.u32()
    const sectionEnd = reader.position + sectionSize
    if (sectionEnd > bytes.byteLength) {
      throw new Error(
        'malformed wasm: section extends beyond the end of the binary'
      )
    }
    if (sectionId !== 2) {
      reader.seek(sectionEnd)
      continue
    }

    const count = reader.u32()
    for (let index = 0; index < count; index++) {
      const module = reader.name()
      const name = reader.name()
      const kind = reader.u8()
      switch (kind) {
        case 0x00:
          reader.u32()
          break
        case 0x01: {
          reader.u8()
          readLimits(reader)
          break
        }
        case 0x02:
          return { module, name, ...readLimits(reader) }
        case 0x03:
          reader.u8()
          reader.u8()
          break
        case 0x04:
          reader.u8()
          reader.u32()
          break
        default:
          throw new Error(
            `unsupported wasm import kind ${kind} for ${module}.${name}`
          )
      }
      if (reader.position > sectionEnd) {
        throw new Error('malformed wasm: import extends beyond its section')
      }
    }
    break
  }

  throw new Error(
    'no imported memory found; expected the module to import `env.memory`'
  )
}

/** Create the shared memory required by a wasm32-wasip1-threads module. */
export function createImportedMemory(bytes: Uint8Array) {
  const imported = parseImportedMemory(bytes)
  if (imported.module !== 'env' || imported.name !== 'memory') {
    throw new Error(
      `unsupported imported memory ${imported.module}.${imported.name}; expected env.memory`
    )
  }
  if (!imported.shared) {
    throw new Error('env.memory must be shared for wasi-threads')
  }
  if (imported.maximum === undefined) {
    throw new Error('shared env.memory must declare a maximum')
  }
  if (
    imported.initial > imported.maximum ||
    imported.maximum > MAX_WASM32_PAGES
  ) {
    throw new Error(
      `invalid wasm32 memory limits: initial=${imported.initial}, maximum=${imported.maximum}`
    )
  }
  return new WebAssembly.Memory({
    initial: imported.initial,
    maximum: imported.maximum,
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
    onCreateWorker: () =>
      new WorkerClass(workerPath, {
        workerData: {
          ...workerData,
          threadIds,
          wasiThreadsModuleSpecifier,
        },
        stdout: false,
        stderr: false,
      }),
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
