import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createImportedMemory,
  createReadCustomSection,
  createThreadSpawn,
  createWasiImportObject,
  initializeWasiThread,
  nextThreadId,
  parseImportedMemory,
} from './wasi-loader.ts'

const uleb = (value) => {
  const bytes = []
  do {
    let byte = value & 0x7f
    value = Math.floor(value / 128)
    if (value !== 0) byte |= 0x80
    bytes.push(byte)
  } while (value !== 0)
  return bytes
}

const string = (value) => {
  const bytes = Buffer.from(value)
  return [...uleb(bytes.length), ...bytes]
}

function section(id, contents) {
  return [id, ...uleb(contents.length), ...contents]
}

function buildModule({
  initial = 1,
  maximum = 4,
  shared = true,
  memoryModule = 'env',
  memoryName = 'memory',
  memory64 = false,
  customSections = [],
} = {}) {
  const flags =
    (maximum == null ? 0 : 0x01) | (shared ? 0x02 : 0) | (memory64 ? 0x04 : 0)
  const memory = [
    ...string(memoryModule),
    ...string(memoryName),
    0x02,
    ...uleb(flags),
    ...uleb(initial),
    ...(maximum == null ? [] : uleb(maximum)),
  ]
  return new Uint8Array([
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00,
    ...section(2, [...uleb(1), ...memory]),
    ...customSections.flatMap(({ name, bytes }) =>
      section(0, [...string(name), ...bytes])
    ),
  ])
}

const CUSTOM_SECTION = '.data.link_section.TEST'
const CUSTOM_BYTES = [1, 2, 3, 4, 5]

async function customSectionFixture(
  customSections = [{ name: CUSTOM_SECTION, bytes: CUSTOM_BYTES }]
) {
  const bytes = buildModule({ customSections })
  const module = await WebAssembly.compile(bytes)
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 })
  const read = createReadCustomSection(module, memory)
  const nameBytes = Buffer.from(CUSTOM_SECTION)
  new Uint8Array(memory.buffer, 71, nameBytes.length).set(nameBytes)
  return { memory, read, nameLength: nameBytes.length }
}

test('parses an imported shared memory', () => {
  assert.deepEqual(
    parseImportedMemory(buildModule({ initial: 17, maximum: 99 })),
    {
      module: 'env',
      name: 'memory',
      initial: 17,
      maximum: 99,
      shared: true,
    }
  )
})

test('rejects malformed and unsupported memory declarations', () => {
  assert.throws(
    () => parseImportedMemory(new Uint8Array(8)),
    /magic and version/
  )
  assert.throws(
    () => parseImportedMemory(buildModule().subarray(0, 10)),
    /section extends beyond/
  )
  assert.throws(
    () => createImportedMemory(buildModule({ maximum: null })),
    /declare a maximum/
  )
  assert.throws(
    () => createImportedMemory(buildModule({ shared: false })),
    /must be shared/
  )
  assert.throws(
    () => createImportedMemory(buildModule({ memoryModule: 'other' })),
    /expected env.memory/
  )
  assert.throws(
    () => parseImportedMemory(buildModule({ memory64: true })),
    /memory64 imports are not supported/
  )
  assert.throws(
    () => createImportedMemory(buildModule({ initial: 5, maximum: 4 })),
    /invalid wasm32 memory limits/
  )
})

test('implements the two-phase custom-section protocol', async () => {
  const { memory, read, nameLength } = await customSectionFixture()
  const target = 512
  new Uint8Array(memory.buffer, target, CUSTOM_BYTES.length).fill(0xaa)

  assert.equal(
    read(71, nameLength, target, CUSTOM_BYTES.length - 1),
    CUSTOM_BYTES.length
  )
  assert.deepEqual(
    [...new Uint8Array(memory.buffer, target, CUSTOM_BYTES.length)],
    [0xaa, 0xaa, 0xaa, 0xaa, 0xaa]
  )
  assert.equal(
    read(71, nameLength, target, CUSTOM_BYTES.length),
    CUSTOM_BYTES.length
  )
  assert.deepEqual(
    [...new Uint8Array(memory.buffer, target, CUSTOM_BYTES.length)],
    CUSTOM_BYTES
  )
})

test('returns zero for a missing custom section and validates memory ranges', async () => {
  const { memory, read, nameLength } = await customSectionFixture()
  const missing = Buffer.from('.data.link_section.MISSING')
  new Uint8Array(memory.buffer, 100, missing.length).set(missing)
  assert.equal(read(100, missing.length, 512, 0), 0)
  assert.throws(
    () => read(-1, nameLength, 512, 10),
    /outside WebAssembly memory/
  )
  assert.throws(
    () => read(71, nameLength, memory.buffer.byteLength, CUSTOM_BYTES.length),
    /outside WebAssembly memory/
  )
})

test('rejects duplicate custom sections instead of picking one', async () => {
  const { read, nameLength } = await customSectionFixture([
    { name: CUSTOM_SECTION, bytes: [1] },
    { name: CUSTOM_SECTION, bytes: [2] },
  ])
  assert.throws(() => read(71, nameLength, 512, 8), /is ambiguous/)
})

test('aliases @emnapi/core napi imports into napi-sys env imports', async () => {
  const bytes = buildModule({ customSections: [] })
  const module = await WebAssembly.compile(bytes)
  const memory = new WebAssembly.Memory({
    initial: 1,
    maximum: 4,
    shared: true,
  })
  const napiGetValue = () => 1
  const emnapiEnv = () => 2
  const wasiFdWrite = () => 3
  const threadSpawn = () => 4
  const imports = createWasiImportObject({
    module,
    memory,
    napiImports: {
      napi: { napi_get_value: napiGetValue },
      env: { _emnapi_env_ref: emnapiEnv },
      emnapi: { emnapi_sync_memory: () => 5 },
    },
    wasiImports: {
      wasi_snapshot_preview1: { fd_write: wasiFdWrite },
      wasi: { existing: () => 6 },
    },
    threadSpawn,
  })

  assert.equal(imports.env.napi_get_value, napiGetValue)
  assert.equal(imports.env._emnapi_env_ref, emnapiEnv)
  assert.equal(imports.env.memory, memory)
  assert.equal(typeof imports.env.read_custom_section, 'function')
  assert.equal(imports.wasi['thread-spawn'], threadSpawn)
  assert.equal(imports.wasi_snapshot_preview1.fd_write, wasiFdWrite)
})

test('allocates thread ids atomically from shared state', () => {
  const ids = new Int32Array(new SharedArrayBuffer(4))
  assert.equal(nextThreadId(ids), 1)
  assert.equal(nextThreadId(ids), 2)
  assert.throws(() => nextThreadId(new Int32Array(1)), /shared Int32Array/)
})

test('passes recursive spawn state to workers and reports failures', () => {
  const workers = []
  class FakeWorker {
    listeners = {}
    unreferenced = false
    constructor(filename, options) {
      this.filename = filename
      this.options = options
      workers.push(this)
    }
    on(event, listener) {
      this.listeners[event] = listener
      return this
    }
    unref() {
      this.unreferenced = true
    }
  }
  const errors = []
  const ids = new Int32Array(new SharedArrayBuffer(4))
  const spawn = createThreadSpawn({
    bytes: buildModule(),
    memory: new WebAssembly.Memory({ initial: 1, maximum: 4, shared: true }),
    threadIds: ids,
    workerPath: '/loader-worker.js',
    napiModuleSpecifier: '/emnapi-provider.js',
    onError: (error, id) => errors.push([error.message, id]),
    WorkerClass: FakeWorker,
  })

  assert.equal(spawn(41), 1)
  assert.equal(workers[0].options.workerData.threadIds, ids)
  assert.equal(workers[0].options.workerData.workerPath, '/loader-worker.js')
  assert.equal(workers[0].options.workerData.startArg, 41)
  assert.equal(workers[0].unreferenced, true)
  workers[0].listeners.exit(2)
  assert.deepEqual(errors, [['wasi thread 1 exited with code 2', 1]])
})

test('spawned threads initialize WASI without _start before entering the thread', () => {
  const calls = []
  const wasi = {
    initialize(instance) {
      calls.push(['initialize', instance.exports])
    },
  }
  const instance = {
    exports: {
      _start: () => calls.push(['unexpected start']),
      wasi_thread_start: (id, arg) => calls.push(['thread start', id, arg]),
    },
  }

  initializeWasiThread(wasi, instance)(7, 11)
  assert.equal('_start' in calls[0][1], false)
  assert.deepEqual(calls[1], ['thread start', 7, 11])
  assert.throws(
    () => initializeWasiThread(wasi, { exports: {} }),
    /does not export wasi_thread_start/
  )
})
