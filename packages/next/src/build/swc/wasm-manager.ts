/**
 * WASM plugin manager: worker pool + module cache.
 *
 * Architecture:
 *   - Module compilation: cached on main thread (WebAssembly.Module is ref-counted)
 *   - Instance lifecycle: delegated to worker threads via postMessage
 *   - Transform hot path: Rust thread talks directly to worker via SharedArrayBuffer
 *   - Host function callbacks during transform: Rust ↔ worker via Atomics
 *
 * The main thread's role is minimal: compile modules, route setup requests to
 * workers, and provide the shared memory pointers to Rust for direct access.
 */

import { Worker } from 'worker_threads'
import path from 'path'

// ---------------------------------------------------------------------------
// Shared memory layout constants (must match wasm-worker.ts and lib.rs)
// ---------------------------------------------------------------------------

const CTRL_BUFFER_INTS = 32 // Int32 slots in control buffer
const CTRL_BUFFER_SIZE = CTRL_BUFFER_INTS * 4
const DATA_BUFFER_SIZE = 8 * 1024 * 1024 // 8MB for memory read/write ops

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

interface WorkerEntry {
  worker: Worker
  ctrlBuffer: SharedArrayBuffer
  dataBuffer: SharedArrayBuffer
  /** Instance IDs owned by this worker */
  instances: Set<number>
  /** Pending postMessage responses */
  pending: Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >
  /** True while a transform is in progress (Atomics-based) */
  busy: boolean
}

const workers: WorkerEntry[] = []
let nextMessageId = 1
let nextInstanceId = 1

// Map from instance ID → worker index for routing
const instanceWorkerMap = new Map<number, number>()

// ---------------------------------------------------------------------------
// Module cache: compile once, clone to workers for free
// ---------------------------------------------------------------------------

let nextModuleId = 1
const compiledModules = new Map<number, WebAssembly.Module>()

// ---------------------------------------------------------------------------
// Worker management
// ---------------------------------------------------------------------------

function createWorker(): WorkerEntry {
  const ctrlBuffer = new SharedArrayBuffer(CTRL_BUFFER_SIZE)
  const dataBuffer = new SharedArrayBuffer(DATA_BUFFER_SIZE)

  // Initialize control flag to IDLE (0)
  new Int32Array(ctrlBuffer)[0] = 0

  const workerPath = path.join(__dirname, 'wasm-worker.js')
  const worker = new Worker(workerPath, {
    workerData: { ctrlBuffer, dataBuffer },
  })

  const entry: WorkerEntry = {
    worker,
    ctrlBuffer,
    dataBuffer,
    instances: new Set(),
    pending: new Map(),
    busy: false,
  }

  worker.on('message', (msg: { id: number; result?: any; error?: string }) => {
    const p = entry.pending.get(msg.id)
    if (p) {
      entry.pending.delete(msg.id)
      if (msg.error) {
        p.reject(new Error(msg.error))
      } else {
        p.resolve(msg.result)
      }
    }
  })

  worker.on('error', (err) => {
    // Reject all pending operations
    for (const [, p] of entry.pending) {
      p.reject(err)
    }
    entry.pending.clear()
  })

  workers.push(entry)
  return entry
}

function sendToWorker(
  entry: WorkerEntry,
  msg: any,
  transfer?: ArrayBuffer[]
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextMessageId++
    msg.id = id
    entry.pending.set(id, { resolve, reject })
    if (transfer) {
      entry.worker.postMessage(msg, transfer)
    } else {
      entry.worker.postMessage(msg)
    }
  })
}

/** Pick the least-loaded worker (fewest instances) */
function pickWorker(): WorkerEntry {
  if (workers.length === 0) {
    return createWorker()
  }

  let best = workers[0]
  for (let i = 1; i < workers.length; i++) {
    if (workers[i].instances.size < best.instances.size) {
      best = workers[i]
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Public API (called from Rust via TSFN)
// ---------------------------------------------------------------------------

export const wasmManager = {
  /**
   * Initialize the worker pool. Called once during registration.
   * Returns an array of { ctrlBuffer, dataBuffer } for each worker,
   * which Rust stores for direct Atomics access.
   */
  initWorkerPool(workerCount: number): Array<{
    ctrlBuffer: SharedArrayBuffer
    dataBuffer: SharedArrayBuffer
  }> {
    for (let i = 0; i < workerCount; i++) {
      createWorker()
    }
    return workers.map((w) => ({
      ctrlBuffer: w.ctrlBuffer,
      dataBuffer: w.dataBuffer,
    }))
  },

  /**
   * Compile a WASM module and cache it. Returns a module ID.
   * The WebAssembly.Module is stored on the main thread; workers receive
   * it via postMessage structured clone (V8 shares the compiled code).
   */
  compileModule(wasmBytes: Buffer): number {
    const id = nextModuleId++
    const module = new WebAssembly.Module(wasmBytes as Uint8Array<ArrayBuffer>)
    compiledModules.set(id, module)
    return id
  },

  /**
   * Clone a cached module (just increments ref count, no recompilation).
   */
  cloneModule(moduleId: number): number {
    const module = compiledModules.get(moduleId)
    if (!module) throw new Error(`Module ${moduleId} not found`)
    const id = nextModuleId++
    compiledModules.set(id, module)
    return id
  },

  /**
   * Instantiate a WASM module on a worker. The module is transferred via
   * structured clone (zero-cost for WebAssembly.Module).
   *
   * Returns { instanceId, workerIndex } so Rust knows which worker's
   * SharedArrayBuffer to use for transforms.
   */
  instantiateOnWorker(
    moduleId: number,
    hostFnDescriptors: Array<{
      name: string
      paramCount: number
      resultCount: number
      index: number
    }>
  ): { instanceId: number; workerIndex: number; promise: Promise<number> } {
    const module = compiledModules.get(moduleId)
    if (!module) throw new Error(`Module ${moduleId} not found`)

    const workerEntry = pickWorker()
    const workerIndex = workers.indexOf(workerEntry)
    const instanceId = nextInstanceId++

    instanceWorkerMap.set(instanceId, workerIndex)
    workerEntry.instances.add(instanceId)

    const promise = sendToWorker(workerEntry, {
      type: 'instantiate',
      instanceId,
      module,
      hostFnDescriptors,
    })

    return { instanceId, workerIndex, promise }
  },

  /**
   * Get the worker index for a given instance (for routing).
   */
  getWorkerIndex(instanceId: number): number {
    const idx = instanceWorkerMap.get(instanceId)
    if (idx === undefined) throw new Error(`Instance ${instanceId} not found`)
    return idx
  },

  /**
   * Read memory from a worker's WASM instance via postMessage.
   * Used for non-hot-path operations (setup, teardown).
   */
  readMemoryAsync(
    instanceId: number,
    ptr: number,
    len: number
  ): Promise<Buffer> {
    const workerIndex = instanceWorkerMap.get(instanceId)
    if (workerIndex === undefined)
      throw new Error(`Instance ${instanceId} not found`)
    return sendToWorker(workers[workerIndex], {
      type: 'readMemory',
      instanceId,
      ptr,
      len,
    }).then((ab: ArrayBuffer) => Buffer.from(ab))
  },

  /**
   * Write memory to a worker's WASM instance via postMessage.
   */
  writeMemoryAsync(
    instanceId: number,
    ptr: number,
    data: Buffer
  ): Promise<void> {
    const workerIndex = instanceWorkerMap.get(instanceId)
    if (workerIndex === undefined)
      throw new Error(`Instance ${instanceId} not found`)
    const ab = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    )
    return sendToWorker(
      workers[workerIndex],
      { type: 'writeMemory', instanceId, ptr, data: ab },
      [ab]
    )
  },

  /**
   * Allocate memory in a worker's WASM instance via postMessage.
   */
  allocAsync(instanceId: number, size: number): Promise<number> {
    const workerIndex = instanceWorkerMap.get(instanceId)
    if (workerIndex === undefined)
      throw new Error(`Instance ${instanceId} not found`)
    return sendToWorker(workers[workerIndex], {
      type: 'alloc',
      instanceId,
      size,
    })
  },

  /**
   * Free memory in a worker's WASM instance via postMessage.
   */
  freeAsync(instanceId: number, ptr: number, size: number): Promise<number> {
    const workerIndex = instanceWorkerMap.get(instanceId)
    if (workerIndex === undefined)
      throw new Error(`Instance ${instanceId} not found`)
    return sendToWorker(workers[workerIndex], {
      type: 'free',
      instanceId,
      ptr,
      size,
    })
  },

  /**
   * Get diagnostics from a worker's WASM instance via postMessage.
   */
  getDiagAsync(instanceId: number): Promise<number> {
    const workerIndex = instanceWorkerMap.get(instanceId)
    if (workerIndex === undefined)
      throw new Error(`Instance ${instanceId} not found`)
    return sendToWorker(workers[workerIndex], {
      type: 'getDiag',
      instanceId,
    })
  },

  dropModule(moduleId: number): void {
    compiledModules.delete(moduleId)
  },

  dropInstance(instanceId: number): void {
    const workerIndex = instanceWorkerMap.get(instanceId)
    if (workerIndex === undefined) return
    const entry = workers[workerIndex]
    entry.instances.delete(instanceId)
    instanceWorkerMap.delete(instanceId)
    // Fire-and-forget cleanup
    sendToWorker(entry, { type: 'dropInstance', instanceId }).catch(() => {})
  },
}
