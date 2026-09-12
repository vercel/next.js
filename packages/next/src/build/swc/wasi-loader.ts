/**
 * Instantiation hooks for a `wasm32-wasip1-threads` build of the native
 * bindings.
 *
 * Such a module cannot be instantiated by a stock WASI runtime: `turbo-tasks`
 * collects its task registries with the `link-section` crate, which on wasm
 * stores them in custom sections and requires the embedder to hand them back
 * through an `env.read_custom_section` import. `scripts/wasi-test-host/` is the
 * test host that proves the contract; this module is its production
 * counterpart.
 *
 * This is groundwork only — nothing here is wired into the SWC-only wasm
 * fallback in `./index.ts`, and `module_init` (absent on wasm) and packaging
 * are deliberately out of scope, so loading Turbopack from wasm does not work
 * yet.
 */

import path from 'node:path'
import { Worker } from 'node:worker_threads'

const MAX_WASM32_PAGES = 65_536

export type ImportedMemory = {
  module: string
  name: string
  initial: number
  maximum: number | undefined
  shared: boolean
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

type WorkerLike = {
  on(event: 'error', listener: (error: Error) => void): WorkerLike
  on(event: 'exit', listener: (code: number) => void): WorkerLike
  unref(): void
}

type WorkerConstructor = new (
  filename: string,
  options: {
    workerData: WasiThreadWorkerData
    stdout: false
    stderr: false
  }
) => WorkerLike

export type WasiThreadWorkerData = {
  bytes: Uint8Array
  memory: WebAssembly.Memory
  threadIds: Int32Array
  threadId: number
  startArg: number
  args: string[]
  env: Record<string, string>
  preopens: Record<string, string>
  workerPath: string
  napiModuleSpecifier: string
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

/** Read an imported memory's limits, which WebAssembly.Module.imports omits. */
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

/** Implement link-section's two-phase env.read_custom_section contract. */
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

/**
 * napi-sys imports N-API symbols from env, while @emnapi/core exposes them in
 * its napi namespace. Alias those functions into env and add the WASI hooks.
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

/** Atomically allocate IDs shared by the main instance and every worker. */
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

export function createThreadSpawn(options: {
  bytes: Uint8Array
  memory: WebAssembly.Memory
  threadIds: Int32Array
  args?: string[]
  env?: Record<string, string>
  preopens?: Record<string, string>
  workerPath?: string
  napiModuleSpecifier?: string
  onError: (error: Error, threadId: number) => void
  WorkerClass?: WorkerConstructor
}) {
  const {
    bytes,
    memory,
    threadIds,
    args = [],
    env = {},
    preopens = {},
    workerPath = path.join(__dirname, 'wasi-loader-worker.js'),
    napiModuleSpecifier = '@emnapi/core',
    onError,
    WorkerClass = Worker,
  } = options

  return (startArg: number) => {
    const threadId = nextThreadId(threadIds)
    try {
      const worker = new WorkerClass(workerPath, {
        workerData: {
          bytes,
          memory,
          threadIds,
          threadId,
          startArg,
          args,
          env,
          preopens,
          workerPath,
          napiModuleSpecifier,
        },
        stdout: false,
        stderr: false,
      })
      let reported = false
      worker.on('error', (error) => {
        reported = true
        onError(error, threadId)
      })
      worker.on('exit', (code) => {
        if (code !== 0 && !reported) {
          onError(
            new Error(`wasi thread ${threadId} exited with code ${code}`),
            threadId
          )
        }
      })
      worker.unref()
      return threadId
    } catch (error) {
      onError(
        error instanceof Error ? error : new Error(String(error)),
        threadId
      )
      return -1
    }
  }
}

/** Bind WASI for a worker without running the command-only _start export.
 *
 * `WASI#initialize` is the reactor-style entry point and rejects a module
 * exporting `_start`, since that marks a command whose `_start` must run
 * exactly once, on the main thread. A spawned thread hides that export to get
 * the WASI binding and enters through the returned `wasi_thread_start` instead.
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
  onThreadError: (error: Error, threadId: number) => void
  workerPath?: string
  napiModuleSpecifier?: string
}) {
  const { bytes, napiModule, wasi } = options
  const module = await WebAssembly.compile(Uint8Array.from(bytes))
  const memory = createImportedMemory(bytes)
  const threadIds = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  )
  const threadSpawn = createThreadSpawn({
    bytes,
    memory,
    threadIds,
    args: options.args,
    env: options.env,
    preopens: options.preopens,
    workerPath: options.workerPath,
    napiModuleSpecifier: options.napiModuleSpecifier,
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
