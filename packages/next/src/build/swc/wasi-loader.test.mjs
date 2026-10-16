import assert from 'node:assert/strict'
import { test } from 'node:test'

import loader from '../../../dist/build/swc/wasi-loader.js'

const {
  createImportedMemory,
  createReadCustomSection,
  createThreadRuntime,
  createWasiEnvironment,
  createWasiImportObject,
  initializeWasiThread,
  instantiateWasiNapiModule,
  nextThreadId,
  registerNapiExports,
  WASI_MEMORY_INITIAL_PAGES,
  WASI_MEMORY_MAXIMUM_PAGES,
} = loader

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

function buildModule({ initial = 1, maximum = 4, customSections = [] } = {}) {
  const memory = [
    ...string('env'),
    ...string('memory'),
    0x02,
    ...uleb(0x03),
    ...uleb(initial),
    ...uleb(maximum),
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

test('creates the shared memory configured by the WASI linker flags', () => {
  const memory = createImportedMemory()
  assert.equal(WASI_MEMORY_INITIAL_PAGES, 8_192)
  assert.equal(WASI_MEMORY_MAXIMUM_PAGES, 65_536)
  assert.equal(memory.buffer.byteLength, WASI_MEMORY_INITIAL_PAGES * 65_536)
  assert.ok(memory.buffer instanceof SharedArrayBuffer)
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

test('registers every napi-rs wasm export before N-API initialization', () => {
  const calls = []
  registerNapiExports({
    exports: {
      memory: {},
      __napi_register__first_0: () => calls.push('first'),
      __napi_register__second_1: () => calls.push('second'),
    },
  })
  assert.deepEqual(calls, ['first', 'second'])
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

test('passes Node parallelism to the main WASI instance', async () => {
  const wasiOptions = []
  class FakeWasi {
    constructor(options) {
      wasiOptions.push(options)
    }
    getImportObject() {
      return {}
    }
    initialize() {}
  }
  const initCalls = []

  await instantiateWasiNapiModule({
    bytes: buildModule({
      initial: WASI_MEMORY_INITIAL_PAGES,
      maximum: WASI_MEMORY_MAXIMUM_PAGES,
    }),
    napiModule: {
      imports: {},
      emnapi: { addSendListener: () => true },
      init: (options) => initCalls.push(options),
    },
    env: { KEEP: 'yes', TURBO_TASKS_AVAILABLE_PARALLELISM: '2' },
    onThreadError: () => {},
    workerPath: '/loader-worker.js',
    WasiClass: FakeWasi,
  })

  assert.equal(wasiOptions.length, 1)
  assert.deepEqual(wasiOptions[0].env, {
    TURBO_TASKS_AVAILABLE_PARALLELISM: '2',
    KEEP: 'yes',
  })
  assert.equal(initCalls.length, 1)
})

test('uses Node parallelism by default and preserves unrelated env', () => {
  const detected = Number(
    createWasiEnvironment({}).TURBO_TASKS_AVAILABLE_PARALLELISM
  )
  assert.equal(Number.isInteger(detected) && detected > 0, true)

  assert.deepEqual(createWasiEnvironment({ KEEP: 'yes' }, 6), {
    TURBO_TASKS_AVAILABLE_PARALLELISM: '6',
    KEEP: 'yes',
  })
})

test('allocates thread ids atomically from shared state', () => {
  const ids = new Int32Array(new SharedArrayBuffer(4))
  assert.equal(nextThreadId(ids), 1)
  assert.equal(nextThreadId(ids), 2)
  assert.throws(() => nextThreadId(new Int32Array(1)), /shared Int32Array/)
})

test('transfers one compiled module through the shared thread manager', async () => {
  const workers = []
  class FakeWorker {
    messages = []
    unreferenced = false

    constructor(filename, options) {
      this.filename = filename
      this.options = options
      workers.push(this)
    }

    postMessage(message) {
      this.messages.push(message)
    }

    unref() {
      this.unreferenced = true
    }
  }

  class FakeThreadManager {
    pthreads = Object.create(null)

    constructor(options) {
      this.options = options
    }

    init() {}

    setup(module, memory) {
      this.module = module
      this.memory = memory
    }

    getNewWorker() {
      const worker = this.options.onCreateWorker()
      worker.postMessage({
        __emnapi__: {
          type: 'load',
          payload: { wasmModule: this.module, wasmMemory: this.memory },
        },
      })
      return worker
    }
  }

  const module = { compiled: true }
  const memory = new WebAssembly.Memory({
    initial: 1,
    maximum: 4,
    shared: true,
  })
  const ids = new Int32Array(new SharedArrayBuffer(4))
  const listenerCalls = []
  const { threadSpawn, manager } = await createThreadRuntime({
    module,
    memory,
    threadIds: ids,
    workerData: {
      args: ['test.wasm'],
      env: createWasiEnvironment({ KEEP: 'yes' }, 6),
      preopens: {},
      workerPath: '/loader-worker.js',
      napiModuleSpecifier: '/emnapi-provider.js',
    },
    workerPath: '/loader-worker.js',
    wasiThreadsModuleSpecifier: '/wasi-threads-provider.js',
    onError: assert.fail,
    beforeLoad(worker) {
      assert.deepEqual(worker.messages, [])
      listenerCalls.push(worker)
    },
    WorkerClass: FakeWorker,
    ThreadManagerClass: FakeThreadManager,
  })

  assert.equal(threadSpawn(41), 1)
  assert.deepEqual(listenerCalls, [workers[0]])
  assert.equal(manager.module, module)
  assert.equal(manager.memory, memory)
  assert.equal(workers[0].options.workerData.threadIds, ids)
  assert.equal('bytes' in workers[0].options.workerData, false)
  assert.equal(
    workers[0].options.workerData.wasiThreadsModuleSpecifier,
    '/wasi-threads-provider.js'
  )
  assert.equal(workers[0].messages[0].__emnapi__.payload.wasmModule, module)
  assert.equal(workers[0].messages[0].__emnapi__.payload.wasmMemory, memory)
  assert.deepEqual(workers[0].messages[1], {
    __emnapi__: { type: 'start', payload: { tid: 1, arg: 41 } },
  })
  assert.equal(workers[0].unreferenced, true)
})

test('spawned threads initialize WASI without process entry points', () => {
  const calls = []
  const wasi = {
    initialize(instance) {
      calls.push(['initialize', instance.exports])
    },
  }
  const instance = {
    exports: {
      _start: () => calls.push(['unexpected start']),
      _initialize: () => calls.push(['unexpected initialize']),
      wasi_thread_start: (id, arg) => calls.push(['thread start', id, arg]),
    },
  }

  initializeWasiThread(wasi, instance)(7, 11)
  assert.equal('_start' in calls[0][1], false)
  assert.equal('_initialize' in calls[0][1], false)
  assert.deepEqual(calls[1], ['thread start', 7, 11])
  assert.throws(
    () => initializeWasiThread(wasi, { exports: {} }),
    /does not export wasi_thread_start/
  )
})
