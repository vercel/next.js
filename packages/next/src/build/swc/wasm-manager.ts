/**
 * WASM plugin manager: worker pool + module cache.
 *
 * Architecture:
 *   - Module compilation: cached on main thread (WebAssembly.Module is ref-counted)
 *   - Instance lifecycle: delegated to worker threads via postMessage
 *   - Transform/getDiag/memory ops: Rust dispatches to worker threads via
 *     per-instance ThreadsafeFunctions (TSFNs) — no blocking loops or Condvars
 *   - Host function callbacks: synchronous NAPI calls on the worker thread
 *
 * The main thread's role: compile modules and route setup requests to workers.
 */

import { Worker } from 'worker_threads'
import path from 'path'

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

interface WorkerEntry {
  worker: Worker
  /** Instance IDs owned by this worker (one per worker in current design) */
  instances: Set<number>
  /** Pending postMessage responses */
  pending: Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >
}

const workers: WorkerEntry[] = []
let nextMessageId = 1
let nextInstanceId = 1

// Map from instance ID → worker index for routing
const instanceWorkerMap = new Map<number, number>()

// Path to the native .node binding, set during init
let nativeBindingsPath: string | null = null

// ---------------------------------------------------------------------------
// Module cache: compile once, clone to workers for free
// ---------------------------------------------------------------------------

let nextModuleId = 1
const compiledModules = new Map<number, WebAssembly.Module>()

// ---------------------------------------------------------------------------
// Worker management
// ---------------------------------------------------------------------------

function createWorker(): WorkerEntry {
  if (!nativeBindingsPath) {
    throw new Error('wasm-manager: nativeBindingsPath not set')
  }

  const workerPath = path.join(__dirname, 'wasm-worker.js')
  const worker = new Worker(workerPath, {
    workerData: { nativeBindingsPath },
    // Suppress the WASI warnings, this isn't a great solution
    execArgv: ['--no-warnings'],
  })

  const entry: WorkerEntry = {
    worker,
    instances: new Set(),
    pending: new Map(),
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
    console.error(`[wasm-manager] worker error:`, err)
    for (const [, p] of entry.pending) {
      p.reject(err)
    }
    entry.pending.clear()
  })

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[wasm-manager] worker exited with code ${code}`)
    }
  })

  workers.push(entry)
  return entry
}

function sendToWorker(entry: WorkerEntry, msg: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextMessageId++
    msg.id = id
    entry.pending.set(id, { resolve, reject })
    entry.worker.postMessage(msg)
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
   * Workers load the native addon directly for NAPI-based communication.
   */
  initWorkerPool(workerCount: number): void {
    for (let i = 0; i < workerCount; i++) {
      createWorker()
    }
  },

  /**
   * Set the path to the native .node binding file.
   * Must be called before initWorkerPool.
   */
  setBindingsPath(bindingsPath: string): void {
    nativeBindingsPath = bindingsPath
  },

  /**
   * Compile a WASM module and cache it. Returns a module ID.
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
   * Rust passes a single callback; JS calls it with the instanceId (number)
   * on success or an error message (string) on failure.
   * After instantiation, the worker registers ops with Rust via NAPI and
   * its event loop remains free to receive TSFN callbacks.
   */
  instantiateOnWorker(
    moduleId: number,
    hostFnDescriptors: Array<[string, number, number, number]>,
    callback: (result: number | string) => void
  ): void {
    const module = compiledModules.get(moduleId)
    if (!module) throw new Error(`Module ${moduleId} not found`)

    const workerEntry = pickWorker()
    const workerIndex = workers.indexOf(workerEntry)
    const instanceId = nextInstanceId++

    instanceWorkerMap.set(instanceId, workerIndex)
    workerEntry.instances.add(instanceId)

    sendToWorker(workerEntry, {
      type: 'instantiate',
      instanceId,
      module,
      hostFnDescriptors,
    }).then(
      () => callback(instanceId),
      (err) => callback(String(err))
    )
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
