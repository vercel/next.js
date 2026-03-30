/**
 * Worker thread for WASM plugin execution.
 *
 * Each worker loads the native NAPI addon directly and communicates with
 * Rust via synchronous NAPI calls — no SharedArrayBuffer or Atomics needed.
 *
 * Lifecycle:
 *   1. Main thread sends 'instantiate' with a WebAssembly.Module
 *   2. Worker instantiates the module, wiring host function imports to NAPI calls
 *   3. Worker registers an ops object with Rust via wasmWorkerRegisterCallback
 *   4. Rust dispatches work via a per-instance ThreadsafeFunction (TSFN)
 *   5. The TSFN callback runs on this worker's event loop, calling WASM exports directly
 *   6. Results are returned to Rust via sync channels (handled inside the TSFN)
 */

import { parentPort, workerData } from 'worker_threads'
import { WASI } from 'wasi'

if (!parentPort) {
  throw new Error('wasm-worker must be run as a worker thread')
}

// Load native addon directly in the worker thread.
// This gives us direct NAPI access for host function callbacks.
const bindings = require(workerData.nativeBindingsPath)

// ---------------------------------------------------------------------------
// Instance storage
// ---------------------------------------------------------------------------

interface InstanceEntry {
  instance: WebAssembly.Instance
  memory: WebAssembly.Memory
}

const instances = new Map<number, InstanceEntry>()
const instanceOps = new Map<number, ReturnType<typeof createInstanceOps>>()

// ---------------------------------------------------------------------------
// Create ops object for a WASM instance.
// These methods are called by Rust via the per-instance TSFN (transform,
// getDiag, memory ops) and also passed as the memory accessor during host
// function dispatch (readBuf, writeBuf, alloc, free).
// ---------------------------------------------------------------------------

function createInstanceOps(entry: InstanceEntry) {
  return {
    transform(
      programPtr: number,
      programLen: number,
      unresolvedMark: number,
      commentsProxy: number
    ): number {
      const transformFn = entry.instance.exports
        .__transform_plugin_process_impl as Function
      return transformFn(
        programPtr,
        programLen,
        unresolvedMark,
        commentsProxy
      ) as number
    },

    getDiag(): number {
      const diagFn = entry.instance.exports
        .__get_transform_plugin_core_pkg_diag as Function
      return diagFn() as number
    },

    readBuf(ptr: number, len: number): Buffer {
      return Buffer.from(new Uint8Array(entry.memory.buffer, ptr, len).slice())
    },

    writeBuf(ptr: number, data: Buffer): void {
      new Uint8Array(entry.memory.buffer, ptr, data.byteLength).set(data)
    },

    alloc(size: number): number {
      return (entry.instance.exports.__alloc as Function)(size) as number
    },

    free(ptr: number, size: number): number {
      return (entry.instance.exports.__free as Function)(ptr, size) as number
    },
  }
}

// ---------------------------------------------------------------------------
// postMessage handlers
// ---------------------------------------------------------------------------

interface HostFnDescriptor {
  name: string
  paramCount: number
  resultCount: number
  index: number
}

parentPort.on('message', (req: any) => {
  try {
    let response: { result: any }

    switch (req.type) {
      case 'instantiate': {
        const instanceId = req.instanceId as number

        // Build env imports that call Rust host functions directly via NAPI
        const envImports: Record<string, Function> = {}
        for (const desc of req.hostFnDescriptors as HostFnDescriptor[]) {
          const { index, paramCount } = desc
          envImports[desc.name] = (...args: number[]) => {
            const ops = instanceOps.get(instanceId)
            if (!ops) {
              throw new Error(`Instance ${instanceId} not found for host fn`)
            }
            return bindings.wasmWorkerDispatchHostFn(
              instanceId,
              index,
              args.slice(0, paramCount),
              ops
            )
          }
        }

        // SWC plugins are compiled as WASI modules
        const wasi = new WASI({ version: 'preview1' })
        const wasiImports = wasi.wasiImport

        const instance = new WebAssembly.Instance(req.module, {
          env: envImports,
          wasi_snapshot_preview1: wasiImports,
        })
        wasi.initialize(instance)
        const memory = instance.exports.memory as WebAssembly.Memory
        const entry: InstanceEntry = { instance, memory }
        instances.set(instanceId, entry)

        // Register ops with Rust — this creates a TSFN targeting this worker's
        // event loop. Rust will call these ops directly via the TSFN.
        const ops = createInstanceOps(entry)
        instanceOps.set(instanceId, ops)
        bindings.wasmWorkerRegisterCallback(instanceId, ops)

        response = { result: instanceId }
        break
      }

      case 'dropInstance': {
        instances.delete(req.instanceId)
        instanceOps.delete(req.instanceId)
        response = { result: null }
        break
      }

      default:
        throw new Error(`Unknown request type: ${req.type}`)
    }

    parentPort!.postMessage({ id: req.id, result: response.result })
  } catch (err: any) {
    parentPort!.postMessage({ id: req.id, error: err.message || String(err) })
  }
})
