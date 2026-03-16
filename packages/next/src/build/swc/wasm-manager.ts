/**
 * JS-side WASM module and instance manager for the NAPI-based SWC plugin
 * runtime.
 *
 * This module is called from Rust via a ThreadsafeFunction. The Rust side
 * dispatches WASM operations (compile, instantiate, transform, memory
 * read/write, alloc/free) to the JS main thread, where V8's WebAssembly APIs
 * are available.
 *
 * Host function callbacks during WASM execution are handled by a Rust
 * `dispatch_fn` that runs synchronously on the JS thread with direct memory
 * access (no cross-thread overhead).
 */

interface WasmModuleEntry {
  module: WebAssembly.Module
}

interface WasmInstanceEntry {
  instance: WebAssembly.Instance
  memory: WebAssembly.Memory
}

interface HostFnDescriptor {
  name: string
  paramCount: number
  resultCount: number
  index: number
}

type DispatchFn = (
  index: number,
  args: number[],
  memory: WebAssembly.Memory,
  allocFn: Function,
  freeFn: Function
) => number[] | undefined

let nextId = 1
const modules = new Map<number, WasmModuleEntry>()
const instances = new Map<number, WasmInstanceEntry>()

export const wasmManager = {
  compileModule(wasmBytes: Buffer): number {
    const id = nextId++
    // WebAssembly.Module() is synchronous in Node.js (no size limit unlike
    // browsers).  Use the underlying ArrayBuffer to satisfy TypeScript's
    // BufferSource constraint (Buffer's .buffer may be SharedArrayBuffer).
    const module = new WebAssembly.Module(wasmBytes as Uint8Array<ArrayBuffer>)
    modules.set(id, { module })
    return id
  },

  instantiateModule(
    moduleId: number,
    descriptors: HostFnDescriptor[],
    dispatchFn: DispatchFn
  ): number {
    const entry = modules.get(moduleId)
    if (!entry) {
      throw new Error(`WASM module ${moduleId} not found`)
    }

    const envImports: Record<string, Function> = {}

    // Mutable context set after instantiation (circular: imports reference
    // exports). Wrapped in an object so loop closures capture a stable ref.
    const ctx: {
      memory: WebAssembly.Memory | null
      allocFn: Function | null
      freeFn: Function | null
    } = { memory: null, allocFn: null, freeFn: null }

    for (const desc of descriptors) {
      const { index, paramCount, resultCount } = desc
      envImports[desc.name] = (...args: number[]) => {
        const results = dispatchFn(
          index,
          args.slice(0, paramCount),
          ctx.memory!,
          ctx.allocFn!,
          ctx.freeFn!
        )
        if (resultCount === 0) return undefined
        if (results && resultCount === 1) return results[0]
        return results?.[0]
      }
    }

    const instance = new WebAssembly.Instance(entry.module, { env: envImports })
    ctx.memory = instance.exports.memory as WebAssembly.Memory
    ctx.allocFn = instance.exports.__alloc as Function
    ctx.freeFn = instance.exports.__free as Function
    const memory = ctx.memory

    const id = nextId++
    instances.set(id, { instance, memory })
    return id
  },

  callTransform(
    instanceId: number,
    programPtr: number,
    programLen: number,
    unresolvedMark: number,
    shouldEnableCommentsProxy: number
  ): number {
    const entry = instances.get(instanceId)
    if (!entry) {
      throw new Error(`WASM instance ${instanceId} not found`)
    }
    const fn_ = entry.instance.exports
      .__transform_plugin_process_impl as Function
    return fn_(
      programPtr,
      programLen,
      unresolvedMark,
      shouldEnableCommentsProxy
    )
  },

  readMemory(instanceId: number, ptr: number, len: number): Buffer {
    const entry = instances.get(instanceId)
    if (!entry) {
      throw new Error(`WASM instance ${instanceId} not found`)
    }
    const view = new Uint8Array(entry.memory.buffer, ptr, len)
    // Copy the data out (the buffer may be detached on memory growth)
    return Buffer.from(view)
  },

  writeMemory(instanceId: number, ptr: number, data: Buffer): void {
    const entry = instances.get(instanceId)
    if (!entry) {
      throw new Error(`WASM instance ${instanceId} not found`)
    }
    new Uint8Array(entry.memory.buffer).set(data, ptr)
  },

  callAlloc(instanceId: number, size: number): number {
    const entry = instances.get(instanceId)
    if (!entry) {
      throw new Error(`WASM instance ${instanceId} not found`)
    }
    return (entry.instance.exports.__alloc as Function)(size)
  },

  callFree(instanceId: number, ptr: number, size: number): number {
    const entry = instances.get(instanceId)
    if (!entry) {
      throw new Error(`WASM instance ${instanceId} not found`)
    }
    return (entry.instance.exports.__free as Function)(ptr, size)
  },

  callGetDiag(instanceId: number): number {
    const entry = instances.get(instanceId)
    if (!entry) {
      throw new Error(`WASM instance ${instanceId} not found`)
    }
    return (
      entry.instance.exports.__get_transform_plugin_core_pkg_diag as Function
    )()
  },

  cloneModule(moduleId: number): number {
    const entry = modules.get(moduleId)
    if (!entry) {
      throw new Error(`WASM module ${moduleId} not found`)
    }
    // WebAssembly.Module is internally reference-counted; sharing is cheap
    const id = nextId++
    modules.set(id, { module: entry.module })
    return id
  },

  dropModule(moduleId: number): void {
    modules.delete(moduleId)
  },

  dropInstance(instanceId: number): void {
    instances.delete(instanceId)
  },
}
