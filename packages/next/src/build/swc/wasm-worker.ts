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
// runtimeId may be 0 at worker creation time; it gets updated per-instantiate message.
let runtimeId: number = workerData.runtimeId

// ---------------------------------------------------------------------------
// Instance storage — the ops object closes over the WASM instance/memory,
// so it serves as both the instance handle and the ops interface.
// ---------------------------------------------------------------------------

const instances = new Map<number, ReturnType<typeof createInstanceOps>>()

function createInstanceOps(
  instance: WebAssembly.Instance,
  memory: WebAssembly.Memory
) {
  return {
    transform(
      programPtr: number,
      programLen: number,
      unresolvedMark: number,
      commentsProxy: number
    ): number {
      const transformFn = instance.exports
        .__transform_plugin_process_impl as Function
      return transformFn(
        programPtr,
        programLen,
        unresolvedMark,
        commentsProxy
      ) as number
    },

    getDiag(): number {
      const diagFn = instance.exports
        .__get_transform_plugin_core_pkg_diag as Function
      return diagFn() as number
    },

    readBuf(ptr: number, len: number): Buffer {
      return Buffer.from(new Uint8Array(memory.buffer, ptr, len).slice())
    },

    writeBuf(ptr: number, data: Buffer): void {
      new Uint8Array(memory.buffer, ptr, data.byteLength).set(data)
    },

    alloc(size: number): number {
      return (instance.exports.__alloc as Function)(size) as number
    },

    free(ptr: number, size: number): number {
      return (instance.exports.__free as Function)(ptr, size) as number
    },
  }
}

// ---------------------------------------------------------------------------
// postMessage handlers
// ---------------------------------------------------------------------------

// Each descriptor is a [name, paramCount, resultCount, index] tuple.
type HostFnDescriptor = [string, number, number, number]

parentPort.on('message', (req: any) => {
  try {
    let response: { result: any }

    switch (req.type) {
      case 'instantiate': {
        const instanceId = req.instanceId as number
        // Update runtimeId from the message (may differ from workerData if
        // workers were created before runtime registration).
        if (req.runtimeId != null) {
          runtimeId = req.runtimeId as number
        }

        // Build env imports that call Rust host functions directly via NAPI
        const envImports: Record<string, Function> = {}
        for (const [
          name,
          paramCount,
          ,
          index,
        ] of req.hostFnDescriptors as HostFnDescriptor[]) {
          const capturedRuntimeID = runtimeId
          envImports[name] = (...args: number[]) => {
            const ops = instances.get(instanceId)
            if (!ops) {
              throw new Error(`Instance ${instanceId} not found for host fn`)
            }
            return bindings.wasmWorkerDispatchHostFn(
              capturedRuntimeID,
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

        // The ops object closes over instance/memory and serves as both
        // the instance handle and the ops interface for Rust.
        const ops = createInstanceOps(instance, memory)
        instances.set(instanceId, ops)
        bindings.wasmWorkerRegisterCallback(runtimeId, instanceId, ops)

        response = { result: instanceId }
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

    parentPort!.postMessage({ id: req.id, result: response.result })
  } catch (err: any) {
    parentPort!.postMessage({ id: req.id, error: err.message || String(err) })
  }
})
