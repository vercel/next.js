use std::{
    path::Path,
    sync::{Arc, mpsc},
};

use napi::{
    Env, JsBuffer, JsFunction, JsNumber, JsObject, JsUnknown, NapiRaw, NapiValue, Status,
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use once_cell::sync::OnceCell;
use swc_plugin_runner::runtime;

/// Identifier for cache stored in local filesystem.
const NAPI_RUNTIME_ID: &str = "napi-v8-v1";

/// Global TSFN for dispatching WASM operations to the JS main thread.
static WASM_TSFN: OnceCell<ThreadsafeFunction<WasmRequest>> = OnceCell::new();

// ---------------------------------------------------------------------------
// Request types dispatched through the TSFN
// ---------------------------------------------------------------------------

enum WasmRequest {
    CompileModule {
        wasm_bytes: Vec<u8>,
        reply: mpsc::SyncSender<anyhow::Result<u64>>,
    },
    Instantiate {
        module_id: u64,
        host_fn_descriptors: Vec<HostFnDescriptor>,
        host_functions: Arc<Vec<(String, runtime::Func)>>,
        reply: mpsc::SyncSender<anyhow::Result<u64>>,
    },
    Transform {
        instance_id: u64,
        program_ptr: u32,
        program_len: u32,
        unresolved_mark: u32,
        should_enable_comments_proxy: u32,
        reply: mpsc::SyncSender<anyhow::Result<u32>>,
    },
    ReadMemory {
        instance_id: u64,
        ptr: u32,
        len: u32,
        reply: mpsc::SyncSender<anyhow::Result<Vec<u8>>>,
    },
    WriteMemory {
        instance_id: u64,
        ptr: u32,
        data: Vec<u8>,
        reply: mpsc::SyncSender<anyhow::Result<()>>,
    },
    Alloc {
        instance_id: u64,
        size: u32,
        reply: mpsc::SyncSender<anyhow::Result<u32>>,
    },
    Free {
        instance_id: u64,
        ptr: u32,
        size: u32,
        reply: mpsc::SyncSender<anyhow::Result<u32>>,
    },
    GetDiagnostics {
        instance_id: u64,
        reply: mpsc::SyncSender<anyhow::Result<u32>>,
    },
    DropModule {
        module_id: u64,
    },
    DropInstance {
        instance_id: u64,
    },
}

// WasmRequest is Send because all fields are Send:
// - Vec<u8>, u32, u64 are Send
// - mpsc::SyncSender is Send
// - Arc<Vec<(String, runtime::Func)>> is Send because Func.func is Box<dyn Fn + Send + Sync>
// - HostFnDescriptor is Send (all primitive/String fields)
unsafe impl Send for WasmRequest {}

struct HostFnDescriptor {
    name: String,
    param_count: u8,
    result_count: u8,
    index: usize,
}

// ---------------------------------------------------------------------------
// TSFN registration (called from JS main thread)
// ---------------------------------------------------------------------------

/// Register the WASM plugin runtime. Must be called from the JS main thread
/// before any SWC transforms that use plugins.
///
/// `js_manager` is a JS object with methods: compileModule, instantiateModule,
/// callTransform, readMemory, writeMemory, callAlloc, callFree, callGetDiag,
/// dropModule, dropInstance.
pub fn register_wasm_runtime(env: &Env, js_manager: &JsObject) -> napi::Result<()> {
    // Store the manager on globalThis so the TSFN callback can access it.
    // We can't capture napi::Ref in the TSFN closure because Ref is !Send.
    let mut global = env.get_global()?;
    global.set_named_property("__nextSwcWasmManager", js_manager)?;

    // Create a dummy JS function for the TSFN.
    // The actual work happens in the mapper closure which has access to Env.
    let dummy_fn = env.create_function_from_closure("__wasm_tsfn_noop", |ctx| {
        ctx.env.get_undefined().map(|v| v.into_unknown())
    })?;

    let tsfn: ThreadsafeFunction<WasmRequest> =
        dummy_fn.create_threadsafe_function(0, |ctx: ThreadSafeCallContext<WasmRequest>| {
            let global = ctx.env.get_global()?;
            let manager: JsObject = global.get_named_property("__nextSwcWasmManager")?;
            handle_wasm_request(&ctx.env, &manager, ctx.value)?;
            // Return empty vec - we don't use the TSFN's JS callback
            Ok(Vec::<JsUnknown>::new())
        })?;

    WASM_TSFN
        .set(tsfn)
        .map_err(|_| napi::Error::from_reason("WASM TSFN already registered"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// TSFN callback: handle WASM requests on the JS main thread
// ---------------------------------------------------------------------------

fn handle_wasm_request(env: &Env, manager: &JsObject, request: WasmRequest) -> napi::Result<()> {
    match request {
        WasmRequest::CompileModule { wasm_bytes, reply } => {
            let result = compile_module_on_js_thread(env, manager, wasm_bytes);
            let _ = reply.send(result);
        }

        WasmRequest::Instantiate {
            module_id,
            host_fn_descriptors,
            host_functions,
            reply,
        } => {
            let result = instantiate_on_js_thread(
                env,
                manager,
                module_id,
                host_fn_descriptors,
                host_functions,
            );
            let _ = reply.send(result);
        }

        WasmRequest::Transform {
            instance_id,
            program_ptr,
            program_len,
            unresolved_mark,
            should_enable_comments_proxy,
            reply,
        } => {
            let result = call_transform_on_js_thread(
                env,
                manager,
                instance_id,
                program_ptr,
                program_len,
                unresolved_mark,
                should_enable_comments_proxy,
            );
            let _ = reply.send(result);
        }

        WasmRequest::ReadMemory {
            instance_id,
            ptr,
            len,
            reply,
        } => {
            let result = read_memory_on_js_thread(env, manager, instance_id, ptr, len);
            let _ = reply.send(result);
        }

        WasmRequest::WriteMemory {
            instance_id,
            ptr,
            data,
            reply,
        } => {
            let result = write_memory_on_js_thread(env, manager, instance_id, ptr, &data);
            let _ = reply.send(result);
        }

        WasmRequest::Alloc {
            instance_id,
            size,
            reply,
        } => {
            let result = call_alloc_on_js_thread(env, manager, instance_id, size);
            let _ = reply.send(result);
        }

        WasmRequest::Free {
            instance_id,
            ptr,
            size,
            reply,
        } => {
            let result = call_free_on_js_thread(env, manager, instance_id, ptr, size);
            let _ = reply.send(result);
        }

        WasmRequest::GetDiagnostics { instance_id, reply } => {
            let result = call_get_diag_on_js_thread(env, manager, instance_id);
            let _ = reply.send(result);
        }

        WasmRequest::DropModule { module_id } => {
            let _ = call_drop_module_on_js_thread(env, manager, module_id);
        }

        WasmRequest::DropInstance { instance_id } => {
            let _ = call_drop_instance_on_js_thread(env, manager, instance_id);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// JS manager method calls (all run on JS main thread)
// ---------------------------------------------------------------------------

fn compile_module_on_js_thread(
    env: &Env,
    manager: &JsObject,
    wasm_bytes: Vec<u8>,
) -> anyhow::Result<u64> {
    let compile_fn: JsFunction = manager.get_named_property("compileModule")?;
    let buffer = env.create_buffer_with_data(wasm_bytes)?.into_raw();
    let result = compile_fn.call(None, &[buffer])?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_double()? as u64)
}

fn instantiate_on_js_thread(
    env: &Env,
    manager: &JsObject,
    module_id: u64,
    host_fn_descriptors: Vec<HostFnDescriptor>,
    host_functions: Arc<Vec<(String, runtime::Func)>>,
) -> anyhow::Result<u64> {
    // Create the Rust dispatch function callable from JS
    let dispatch_fn = create_dispatch_fn(env, host_functions)?;

    // Build the descriptors array for JS
    let mut descriptors_arr = env.create_array_with_length(host_fn_descriptors.len())?;
    for (i, desc) in host_fn_descriptors.iter().enumerate() {
        let mut obj = env.create_object()?;
        obj.set_named_property("name", env.create_string(&desc.name)?)?;
        obj.set_named_property("paramCount", env.create_int32(desc.param_count as i32)?)?;
        obj.set_named_property("resultCount", env.create_int32(desc.result_count as i32)?)?;
        obj.set_named_property("index", env.create_int32(desc.index as i32)?)?;
        descriptors_arr.set_element(i as u32, obj)?;
    }

    let instantiate_fn: JsFunction = manager.get_named_property("instantiateModule")?;
    let module_id_js = env.create_double(module_id as f64)?;
    let result = instantiate_fn.call(
        None,
        &[
            unsafe { JsUnknown::from_raw_unchecked(env.raw(), module_id_js.raw()) },
            unsafe { JsUnknown::from_raw_unchecked(env.raw(), descriptors_arr.raw()) },
            unsafe { JsUnknown::from_raw_unchecked(env.raw(), dispatch_fn.raw()) },
        ],
    )?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_double()? as u64)
}

fn call_transform_on_js_thread(
    env: &Env,
    manager: &JsObject,
    instance_id: u64,
    program_ptr: u32,
    program_len: u32,
    unresolved_mark: u32,
    should_enable_comments_proxy: u32,
) -> anyhow::Result<u32> {
    let transform_fn: JsFunction = manager.get_named_property("callTransform")?;
    let result = transform_fn.call(
        None,
        &[
            env.create_double(instance_id as f64)?.into_unknown(),
            env.create_uint32(program_ptr)?.into_unknown(),
            env.create_uint32(program_len)?.into_unknown(),
            env.create_uint32(unresolved_mark)?.into_unknown(),
            env.create_uint32(should_enable_comments_proxy)?
                .into_unknown(),
        ],
    )?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_uint32()?)
}

fn read_memory_on_js_thread(
    env: &Env,
    manager: &JsObject,
    instance_id: u64,
    ptr: u32,
    len: u32,
) -> anyhow::Result<Vec<u8>> {
    let read_fn: JsFunction = manager.get_named_property("readMemory")?;
    let result = read_fn.call(
        None,
        &[
            env.create_double(instance_id as f64)?.into_unknown(),
            env.create_uint32(ptr)?.into_unknown(),
            env.create_uint32(len)?.into_unknown(),
        ],
    )?;
    let buffer: JsBuffer = result.try_into()?;
    let buffer_value = buffer.into_value()?;
    Ok(buffer_value.to_vec())
}

fn write_memory_on_js_thread(
    env: &Env,
    manager: &JsObject,
    instance_id: u64,
    ptr: u32,
    data: &[u8],
) -> anyhow::Result<()> {
    let write_fn: JsFunction = manager.get_named_property("writeMemory")?;
    let data_buffer = env.create_buffer_with_data(data.to_vec())?.into_raw();
    write_fn.call(
        None,
        &[
            env.create_double(instance_id as f64)?.into_unknown(),
            env.create_uint32(ptr)?.into_unknown(),
            data_buffer.into_unknown(),
        ],
    )?;
    Ok(())
}

fn call_alloc_on_js_thread(
    env: &Env,
    manager: &JsObject,
    instance_id: u64,
    size: u32,
) -> anyhow::Result<u32> {
    let alloc_fn: JsFunction = manager.get_named_property("callAlloc")?;
    let result = alloc_fn.call(
        None,
        &[
            env.create_double(instance_id as f64)?.into_unknown(),
            env.create_uint32(size)?.into_unknown(),
        ],
    )?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_uint32()?)
}

fn call_free_on_js_thread(
    env: &Env,
    manager: &JsObject,
    instance_id: u64,
    ptr: u32,
    size: u32,
) -> anyhow::Result<u32> {
    let free_fn: JsFunction = manager.get_named_property("callFree")?;
    let result = free_fn.call(
        None,
        &[
            env.create_double(instance_id as f64)?.into_unknown(),
            env.create_uint32(ptr)?.into_unknown(),
            env.create_uint32(size)?.into_unknown(),
        ],
    )?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_uint32()?)
}

fn call_get_diag_on_js_thread(
    env: &Env,
    manager: &JsObject,
    instance_id: u64,
) -> anyhow::Result<u32> {
    let diag_fn: JsFunction = manager.get_named_property("callGetDiag")?;
    let result = diag_fn.call(
        None,
        &[env.create_double(instance_id as f64)?.into_unknown()],
    )?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_uint32()?)
}

fn call_drop_module_on_js_thread(
    env: &Env,
    manager: &JsObject,
    module_id: u64,
) -> napi::Result<()> {
    let drop_fn: JsFunction = manager.get_named_property("dropModule")?;
    drop_fn.call(None, &[env.create_double(module_id as f64)?.into_unknown()])?;
    Ok(())
}

fn call_drop_instance_on_js_thread(
    env: &Env,
    manager: &JsObject,
    instance_id: u64,
) -> napi::Result<()> {
    let drop_fn: JsFunction = manager.get_named_property("dropInstance")?;
    drop_fn.call(
        None,
        &[env.create_double(instance_id as f64)?.into_unknown()],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Host function dispatch (called synchronously from JS during WASM execution)
// ---------------------------------------------------------------------------

/// Create a Rust function callable from JS that dispatches host function calls.
///
/// During WASM execution, JS import wrappers call this function with:
///   (fn_index: number, args: number[], memory: WebAssembly.Memory,
///    allocFn: Function, freeFn: Function) => number[] | undefined
fn create_dispatch_fn(
    env: &Env,
    host_functions: Arc<Vec<(String, runtime::Func)>>,
) -> napi::Result<JsFunction> {
    env.create_function_from_closure("__swc_plugin_dispatch", move |ctx| {
        let fn_index: u32 = ctx.get::<JsNumber>(0)?.get_uint32()?;
        let js_args: JsObject = ctx.get(1)?;
        let memory: JsObject = ctx.get(2)?;
        let alloc_fn: JsFunction = ctx.get(3)?;
        let free_fn: JsFunction = ctx.get(4)?;

        let (ref _name, ref func) = host_functions[fn_index as usize];
        let param_count = func.sign.0 as usize;
        let result_count = func.sign.1 as usize;

        // Read input args from JS array
        let mut input = vec![0i32; param_count];
        for i in 0..param_count {
            let val: JsNumber = js_args.get_element(i as u32)?;
            input[i] = val.get_int32()?;
        }

        // Create DirectCaller for synchronous memory access on JS thread
        let mut direct_caller = DirectCaller {
            env: ctx.env,
            memory: &memory,
            alloc_fn: &alloc_fn,
            free_fn: &free_fn,
        };

        let mut output = vec![0i32; result_count];
        (func.func)(&mut direct_caller, &input, &mut output);

        // Return results as JS array (or undefined if no results)
        if result_count == 0 {
            ctx.env.get_undefined().map(|v| v.into_unknown())
        } else {
            let mut result_array = ctx.env.create_array_with_length(result_count)?;
            for (i, &v) in output.iter().enumerate() {
                result_array.set_element(i as u32, ctx.env.create_int32(v)?)?;
            }
            Ok(result_array.into_unknown())
        }
    })
}

// ---------------------------------------------------------------------------
// DirectCaller: JS-thread Caller with direct memory access
// ---------------------------------------------------------------------------

/// Caller implementation for host function callbacks during WASM execution.
/// Runs on the JS main thread with direct access to the WASM instance's memory.
struct DirectCaller<'a> {
    env: &'a Env,
    memory: &'a JsObject,     // WebAssembly.Memory object
    alloc_fn: &'a JsFunction, // instance.exports.__alloc
    free_fn: &'a JsFunction,  // instance.exports.__free
}

impl<'a> runtime::Caller<'a> for DirectCaller<'a> {
    fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
        // Re-read memory.buffer each time (may change after memory growth)
        let buffer: JsObject = self.memory.get_named_property("buffer")?;
        // Get the raw buffer data
        let array_buffer = unsafe {
            let mut data = std::ptr::null_mut();
            let mut len = 0;
            let status = napi::sys::napi_get_arraybuffer_info(
                self.env.raw(),
                buffer.raw(),
                &mut data,
                &mut len,
            );
            if status != napi::sys::Status::napi_ok {
                anyhow::bail!("Failed to get ArrayBuffer info: {:?}", status);
            }
            std::slice::from_raw_parts(data as *const u8, len)
        };

        let start = ptr as usize;
        let end = start + buf.len();
        if end > array_buffer.len() {
            anyhow::bail!(
                "read out of bounds: {}..{} > {}",
                start,
                end,
                array_buffer.len()
            );
        }
        buf.copy_from_slice(&array_buffer[start..end]);
        Ok(())
    }

    fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
        // Re-read memory.buffer each time (may change after memory growth)
        let buffer: JsObject = self.memory.get_named_property("buffer")?;
        let array_buffer = unsafe {
            let mut data = std::ptr::null_mut();
            let mut len = 0;
            let status = napi::sys::napi_get_arraybuffer_info(
                self.env.raw(),
                buffer.raw(),
                &mut data,
                &mut len,
            );
            if status != napi::sys::Status::napi_ok {
                anyhow::bail!("Failed to get ArrayBuffer info: {:?}", status);
            }
            std::slice::from_raw_parts_mut(data as *mut u8, len)
        };

        let start = ptr as usize;
        let end = start + buf.len();
        if end > array_buffer.len() {
            anyhow::bail!(
                "write out of bounds: {}..{} > {}",
                start,
                end,
                array_buffer.len()
            );
        }
        array_buffer[start..end].copy_from_slice(buf);
        Ok(())
    }

    fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
        let size_js = self.env.create_uint32(size)?;
        let result = self.alloc_fn.call(None, &[size_js])?;
        let result: JsNumber = result.try_into()?;
        Ok(result.get_uint32()?)
    }

    fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
        let ptr_js = self.env.create_uint32(ptr)?;
        let size_js = self.env.create_uint32(size)?;
        let result = self.free_fn.call(None, &[ptr_js, size_js])?;
        let result: JsNumber = result.try_into()?;
        Ok(result.get_uint32()?)
    }
}

// ---------------------------------------------------------------------------
// TsfnCaller: background-thread Caller via TSFN dispatch
// ---------------------------------------------------------------------------

/// Caller implementation for the background thread.
/// Dispatches all memory operations to the JS main thread via the global TSFN.
struct TsfnCaller {
    instance_id: u64,
}

fn tsfn_call_blocking<T: Send + 'static>(
    request_fn: impl FnOnce(mpsc::SyncSender<T>) -> WasmRequest,
) -> anyhow::Result<T> {
    let tsfn = WASM_TSFN
        .get()
        .ok_or_else(|| anyhow::anyhow!("WASM TSFN not registered"))?;
    let (tx, rx) = mpsc::sync_channel(0);
    let request = request_fn(tx);
    let status = tsfn.call(Ok(request), ThreadsafeFunctionCallMode::Blocking);
    if !matches!(status, Status::Ok) {
        anyhow::bail!("TSFN call failed with status: {:?}", status);
    }
    rx.recv()
        .map_err(|e| anyhow::anyhow!("TSFN recv failed: {}", e))
}

impl<'a> runtime::Caller<'a> for TsfnCaller {
    fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
        let data = tsfn_call_blocking(|reply| WasmRequest::ReadMemory {
            instance_id: self.instance_id,
            ptr,
            len: buf.len() as u32,
            reply,
        })??;
        buf.copy_from_slice(&data);
        Ok(())
    }

    fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
        tsfn_call_blocking(|reply| WasmRequest::WriteMemory {
            instance_id: self.instance_id,
            ptr,
            data: buf.to_vec(),
            reply,
        })?
    }

    fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
        tsfn_call_blocking(|reply| WasmRequest::Alloc {
            instance_id: self.instance_id,
            size,
            reply,
        })?
    }

    fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
        tsfn_call_blocking(|reply| WasmRequest::Free {
            instance_id: self.instance_id,
            ptr,
            size,
            reply,
        })?
    }
}

// ---------------------------------------------------------------------------
// NapiRuntime: implements swc_plugin_runner::runtime::Runtime
// ---------------------------------------------------------------------------

struct NapiModuleCache {
    wasm_bytes: Vec<u8>,
}

/// The NAPI-based SWC plugin runtime.
///
/// Delegates WASM compilation and execution to Node.js's V8 engine via NAPI.
/// This eliminates the wasmtime/Cranelift compiler from the binary.
#[derive(Clone, Copy, Debug)]
pub struct NapiRuntime;

impl runtime::Runtime for NapiRuntime {
    fn identifier(&self) -> &'static str {
        NAPI_RUNTIME_ID
    }

    fn prepare_module(&self, bytes: &[u8]) -> anyhow::Result<runtime::ModuleCache> {
        // Store raw WASM bytes. V8 compilation happens lazily during init().
        Ok(runtime::ModuleCache(Box::new(NapiModuleCache {
            wasm_bytes: bytes.to_vec(),
        })))
    }

    fn init(
        &self,
        _name: &str,
        imports: Vec<(String, runtime::Func)>,
        _envs: Vec<(String, String)>,
        module: runtime::Module,
    ) -> anyhow::Result<Box<dyn runtime::Instance>> {
        let wasm_bytes = match module {
            runtime::Module::Cache(cache) => {
                cache.0.downcast::<NapiModuleCache>().unwrap().wasm_bytes
            }
            runtime::Module::Bytes(buf) => buf.to_vec(),
        };

        // Step 1: Compile WASM module on JS thread
        let module_id =
            tsfn_call_blocking(|reply| WasmRequest::CompileModule { wasm_bytes, reply })??;

        // Step 2: Build host function descriptors
        let host_fn_descriptors: Vec<HostFnDescriptor> = imports
            .iter()
            .enumerate()
            .map(|(i, (name, func))| HostFnDescriptor {
                name: name.clone(),
                param_count: func.sign.0,
                result_count: func.sign.1,
                index: i,
            })
            .collect();

        let host_functions = Arc::new(imports);

        // Step 3: Instantiate on JS thread (creates dispatch_fn + JS import wrappers)
        let instance_id = tsfn_call_blocking(|reply| WasmRequest::Instantiate {
            module_id,
            host_fn_descriptors,
            host_functions: host_functions.clone(),
            reply,
        })??;

        // Step 4: Diagnostics handshake
        let _diag =
            tsfn_call_blocking(|reply| WasmRequest::GetDiagnostics { instance_id, reply })??;

        Ok(Box::new(NapiInstance {
            instance_id,
            module_id,
            _host_functions: host_functions,
        }))
    }

    fn clone_cache(&self, cache: &runtime::ModuleCache) -> Option<runtime::ModuleCache> {
        let cache = cache.0.downcast_ref::<NapiModuleCache>()?;
        Some(runtime::ModuleCache(Box::new(NapiModuleCache {
            wasm_bytes: cache.wasm_bytes.clone(),
        })))
    }

    unsafe fn load_cache(&self, _path: &Path) -> Option<runtime::ModuleCache> {
        // V8 does not expose WebAssembly.Module serialization via NAPI
        None
    }

    fn store_cache(&self, _path: &Path, _cache: &runtime::ModuleCache) -> anyhow::Result<()> {
        // No-op: V8 does not expose WebAssembly.Module serialization
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// NapiInstance: implements swc_plugin_runner::runtime::Instance
// ---------------------------------------------------------------------------

struct NapiInstance {
    instance_id: u64,
    module_id: u64,
    /// Keep host functions alive for the lifetime of the instance.
    /// The dispatch_fn closure (on JS thread) holds an Arc clone.
    _host_functions: Arc<Vec<(String, runtime::Func)>>,
}

// SAFETY: NapiInstance is Sync because all access to the JS-side instance
// goes through the TSFN (which handles thread safety). The _host_functions
// Arc is Send+Sync because Func.func is Box<dyn Fn + Send + Sync>.
unsafe impl Sync for NapiInstance {}

impl runtime::Instance for NapiInstance {
    fn transform(
        &mut self,
        program_ptr: u32,
        program_len: u32,
        unresolved_mark: u32,
        should_enable_comments_proxy: u32,
    ) -> anyhow::Result<u32> {
        tsfn_call_blocking(|reply| WasmRequest::Transform {
            instance_id: self.instance_id,
            program_ptr,
            program_len,
            unresolved_mark,
            should_enable_comments_proxy,
            reply,
        })?
    }

    fn caller(&mut self) -> anyhow::Result<Box<dyn runtime::Caller<'_> + '_>> {
        Ok(Box::new(TsfnCaller {
            instance_id: self.instance_id,
        }))
    }

    fn cache(&self) -> Option<runtime::ModuleCache> {
        // No serialization support for V8 modules
        None
    }
}

impl Drop for NapiInstance {
    fn drop(&mut self) {
        if let Some(tsfn) = WASM_TSFN.get() {
            // Fire-and-forget cleanup on the JS thread
            tsfn.call(
                Ok(WasmRequest::DropInstance {
                    instance_id: self.instance_id,
                }),
                ThreadsafeFunctionCallMode::NonBlocking,
            );
            tsfn.call(
                Ok(WasmRequest::DropModule {
                    module_id: self.module_id,
                }),
                ThreadsafeFunctionCallMode::NonBlocking,
            );
        }
    }
}
