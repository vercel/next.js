/**
 * Worker thread for WASM plugin execution.
 *
 * Each worker owns WebAssembly.Instance objects and runs transforms in its own
 * V8 isolate — true parallelism across workers.
 *
 * Two communication channels:
 *
 * 1. postMessage (async): setup operations (instantiate, drop) and
 *    non-hot-path memory operations (caller read/write/alloc/free outside
 *    of transforms, getDiag).
 *
 * 2. SharedArrayBuffer + Atomics (sync): transform hot path.
 *    Rust thread writes transform args → Atomics.notify → worker runs transform.
 *    During transform, host function callbacks ping-pong between worker and
 *    Rust thread via Atomics.wait/notify — no main thread involvement.
 *
 * The worker uses Atomics.waitAsync to watch for transform requests without
 * blocking the event loop, so postMessage handlers remain responsive.
 * Once a transform starts, it runs synchronously (blocking the event loop
 * briefly), which is correct since no messages need processing mid-transform.
 *
 * Protocol state machine (ctrl[0] = FLAG):
 *
 *   IDLE → TRANSFORM_REQ → [worker runs __transform_plugin_process_impl]
 *     │                       │
 *     │                       ├─ WASM calls host fn import:
 *     │                       │    → HOST_FN_REQ (worker waits)
 *     │                       │    → [Rust runs Func closure]
 *     │                       │       │
 *     │                       │       ├─ Rust needs mem op:
 *     │                       │       │    → MEM_OP_REQ (Rust waits)
 *     │                       │       │    → [worker does mem op]
 *     │                       │       │    → MEM_OP_RESP (worker waits)
 *     │                       │       │    → [Rust continues, may do more ops]
 *     │                       │       │
 *     │                       │       → HOST_FN_RESP (Rust waits)
 *     │                       │       → [worker continues WASM, may hit more host fns]
 *     │                       │
 *     │                       → TRANSFORM_RESP
 *     │
 *     → IDLE (Rust resets after reading result)
 */

import { parentPort, workerData } from 'worker_threads'

if (!parentPort) {
  throw new Error('wasm-worker must be run as a worker thread')
}

// ---------------------------------------------------------------------------
// Shared memory layout constants (must match lib.rs)
// ---------------------------------------------------------------------------

const FLAG = 0

// Transform request/response:
const INSTANCE_ID = 1
const PROGRAM_PTR = 2
const PROGRAM_LEN = 3
const UNRESOLVED_MARK = 4
const COMMENTS_PROXY = 5
const TRANSFORM_RESULT = 6

// Host function callback (worker → Rust):
const HOST_FN_INDEX = 7
const HOST_FN_PARAM_COUNT = 8
const HOST_FN_RESULT_COUNT = 9
const HOST_FN_ARGS_START = 10 // args and results at [10..10+N]

// Memory operation (Rust → worker, during host fn):
const MEM_OP_TYPE = 7
const MEM_OP_PTR = 8
const MEM_OP_LEN = 9
const MEM_OP_RESULT = 10

// Flag values:
const IDLE = 0
const TRANSFORM_REQ = 1
const TRANSFORM_RESP = 2
const HOST_FN_REQ = 3
const HOST_FN_RESP = 4
const MEM_OP_REQ = 5
const MEM_OP_RESP = 6

// Memory op types:
const MEM_READ = 1
const MEM_WRITE = 2
const MEM_ALLOC = 3
const MEM_FREE = 4

// ---------------------------------------------------------------------------
// Shared buffers
// ---------------------------------------------------------------------------

const ctrlBuffer: SharedArrayBuffer = workerData.ctrlBuffer
const dataBuffer: SharedArrayBuffer = workerData.dataBuffer
const ctrl = new Int32Array(ctrlBuffer)
const data = new Uint8Array(dataBuffer)

// ---------------------------------------------------------------------------
// Instance storage
// ---------------------------------------------------------------------------

interface InstanceEntry {
  instance: WebAssembly.Instance
  memory: WebAssembly.Memory
}

const instances = new Map<number, InstanceEntry>()
let activeEntry: InstanceEntry | null = null

// ---------------------------------------------------------------------------
// Host function dispatch via Atomics (during transform only)
// ---------------------------------------------------------------------------

function dispatchHostFn(
  fnIndex: number,
  args: number[],
  paramCount: number,
  resultCount: number
): number | undefined {
  // Write host function request (fields 7+ are free since transform args
  // were already consumed)
  Atomics.store(ctrl, HOST_FN_INDEX, fnIndex)
  Atomics.store(ctrl, HOST_FN_PARAM_COUNT, paramCount)
  Atomics.store(ctrl, HOST_FN_RESULT_COUNT, resultCount)
  for (let i = 0; i < paramCount; i++) {
    Atomics.store(ctrl, HOST_FN_ARGS_START + i, args[i])
  }

  // Signal Rust thread
  Atomics.store(ctrl, FLAG, HOST_FN_REQ)
  Atomics.notify(ctrl, FLAG)

  // Wait for Rust to finish the host function.
  // During execution, Rust may send MEM_OP_REQ for memory operations.
  while (true) {
    Atomics.wait(ctrl, FLAG, HOST_FN_REQ)
    const flag = Atomics.load(ctrl, FLAG)

    if (flag === HOST_FN_RESP) {
      // Host function completed. Read results.
      if (resultCount === 0) return undefined
      return Atomics.load(ctrl, HOST_FN_ARGS_START)
    }

    if (flag === MEM_OP_REQ) {
      handleMemoryOp()
      // After handling, flag is MEM_OP_RESP. Wait for Rust to continue
      // (it will set either MEM_OP_REQ for another op, or HOST_FN_RESP).
      Atomics.wait(ctrl, FLAG, MEM_OP_RESP)
      continue
    }

    // Unexpected flag — possible spurious wakeup, re-check
  }
}

function handleMemoryOp(): void {
  if (!activeEntry) {
    throw new Error('No active instance for memory operation')
  }

  const opType = Atomics.load(ctrl, MEM_OP_TYPE)
  const ptr = Atomics.load(ctrl, MEM_OP_PTR)
  const len = Atomics.load(ctrl, MEM_OP_LEN)

  switch (opType) {
    case MEM_READ: {
      const src = new Uint8Array(activeEntry.memory.buffer, ptr, len)
      data.set(src, 0)
      break
    }
    case MEM_WRITE: {
      new Uint8Array(activeEntry.memory.buffer, ptr, len).set(
        data.subarray(0, len)
      )
      break
    }
    case MEM_ALLOC: {
      const result = (activeEntry.instance.exports.__alloc as Function)(
        len
      ) as number
      Atomics.store(ctrl, MEM_OP_RESULT, result)
      break
    }
    case MEM_FREE: {
      const result = (activeEntry.instance.exports.__free as Function)(
        ptr,
        len
      ) as number
      Atomics.store(ctrl, MEM_OP_RESULT, result)
      break
    }
    default:
      throw new Error(`Unexpected optype: ${opType}`)
  }

  // Signal completion
  Atomics.store(ctrl, FLAG, MEM_OP_RESP)
  Atomics.notify(ctrl, FLAG)
}

// ---------------------------------------------------------------------------
// Transform via Atomics.waitAsync
// ---------------------------------------------------------------------------

function waitForTransformRequest(): void {
  const result = Atomics.waitAsync(ctrl, FLAG, IDLE)
  if (result.async) {
    result.value.then(onTransformWake)
  } else {
    // Flag already changed — handle immediately
    setImmediate(() => onTransformWake('not-equal'))
  }
}

function onTransformWake(_result: string): void {
  const flag = Atomics.load(ctrl, FLAG)
  if (flag === TRANSFORM_REQ) {
    runTransform()
  }
  // Re-arm for next transform (flag should be IDLE after Rust resets it)
  waitForTransformRequest()
}

function runTransform(): void {
  const instanceId = Atomics.load(ctrl, INSTANCE_ID)
  const programPtr = Atomics.load(ctrl, PROGRAM_PTR)
  const programLen = Atomics.load(ctrl, PROGRAM_LEN)
  const unresolvedMark = Atomics.load(ctrl, UNRESOLVED_MARK)
  const commentsProxy = Atomics.load(ctrl, COMMENTS_PROXY)

  const entry = instances.get(instanceId)
  if (!entry) {
    Atomics.store(ctrl, TRANSFORM_RESULT, -1)
    Atomics.store(ctrl, FLAG, TRANSFORM_RESP)
    Atomics.notify(ctrl, FLAG)
    return
  }

  activeEntry = entry

  try {
    const transformFn = entry.instance.exports
      .__transform_plugin_process_impl as Function
    const result = transformFn(
      programPtr,
      programLen,
      unresolvedMark,
      commentsProxy
    ) as number
    Atomics.store(ctrl, TRANSFORM_RESULT, result)
  } catch {
    Atomics.store(ctrl, TRANSFORM_RESULT, -1)
  } finally {
    activeEntry = null
  }

  Atomics.store(ctrl, FLAG, TRANSFORM_RESP)
  Atomics.notify(ctrl, FLAG)
}

// Start watching for transform requests
waitForTransformRequest()

// ---------------------------------------------------------------------------
// postMessage handlers for non-hot-path operations
// ---------------------------------------------------------------------------

interface HostFnDescriptor {
  name: string
  paramCount: number
  resultCount: number
  index: number
}

parentPort.on('message', (req: any) => {
  try {
    let response: { result: any; transfer?: ArrayBuffer[] }

    switch (req.type) {
      case 'instantiate': {
        const envImports: Record<string, Function> = {}
        for (const desc of req.hostFnDescriptors as HostFnDescriptor[]) {
          const { index, paramCount, resultCount } = desc
          envImports[desc.name] = (...args: number[]) => {
            return dispatchHostFn(
              index,
              args.slice(0, paramCount),
              paramCount,
              resultCount
            )
          }
        }

        const instance = new WebAssembly.Instance(req.module, {
          env: envImports,
        })
        const memory = instance.exports.memory as WebAssembly.Memory
        instances.set(req.instanceId, { instance, memory })
        response = { result: req.instanceId }
        break
      }

      case 'readMemory': {
        const entry = instances.get(req.instanceId)
        if (!entry) throw new Error(`Instance ${req.instanceId} not found`)
        const copy = new Uint8Array(req.len)
        copy.set(new Uint8Array(entry.memory.buffer, req.ptr, req.len))
        response = { result: copy.buffer, transfer: [copy.buffer] }
        break
      }

      case 'writeMemory': {
        const entry = instances.get(req.instanceId)
        if (!entry) throw new Error(`Instance ${req.instanceId} not found`)
        new Uint8Array(entry.memory.buffer).set(
          new Uint8Array(req.data),
          req.ptr
        )
        response = { result: null }
        break
      }

      case 'alloc': {
        const entry = instances.get(req.instanceId)
        if (!entry) throw new Error(`Instance ${req.instanceId} not found`)
        response = {
          result: (entry.instance.exports.__alloc as Function)(req.size),
        }
        break
      }

      case 'free': {
        const entry = instances.get(req.instanceId)
        if (!entry) throw new Error(`Instance ${req.instanceId} not found`)
        response = {
          result: (entry.instance.exports.__free as Function)(
            req.ptr,
            req.size
          ),
        }
        break
      }

      case 'getDiag': {
        const entry = instances.get(req.instanceId)
        if (!entry) throw new Error(`Instance ${req.instanceId} not found`)
        response = {
          result: (
            entry.instance.exports
              .__get_transform_plugin_core_pkg_diag as Function
          )(),
        }
        break
      }

      case 'dropInstance': {
        instances.delete(req.instanceId)
        response = { result: null }
        break
      }

      default:
        throw new Error(`Unknown request type: ${req.type}`)
    }

    if (response.transfer) {
      parentPort!.postMessage(
        { id: req.id, result: response.result },
        response.transfer
      )
    } else {
      parentPort!.postMessage({ id: req.id, result: response.result })
    }
  } catch (err: any) {
    parentPort!.postMessage({ id: req.id, error: err.message || String(err) })
  }
})
