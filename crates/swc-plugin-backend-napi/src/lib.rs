use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, LazyLock, Mutex, OnceLock, mpsc},
};

use napi::{
    Env, JsBuffer, JsFunction, JsNumber, JsObject, JsUnknown, NapiRaw, NapiValue, Status,
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use swc_plugin_runner::runtime;

/// Identifier for cache stored in local filesystem.
const NAPI_RUNTIME_ID: &str = "napi-v8-v1";

/// Global TSFN for dispatching operations to the JS main thread.
/// Used for module compilation, instantiation, and non-hot-path memory ops.
static WASM_TSFN: OnceLock<ThreadsafeFunction<WasmRequest>> = OnceLock::new();

/// The raw napi_env pointer that registered the WASM runtime.
/// Used to assert we're never re-registered from a different environment.
static WASM_TSFN_ENV: OnceLock<usize> = OnceLock::new();

/// Global host function registry: maps instance_id → Vec<Func>.
/// Workers call back into these during WASM execution via NAPI.
static HOST_FNS: LazyLock<Mutex<HashMap<u64, Arc<Vec<runtime::Func>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Global per-instance TSFN registry: maps instance_id → TSFN targeting the worker thread.
/// Used to dispatch transform/getDiag/memory ops to the correct worker.
static INSTANCE_TSFNS: LazyLock<Mutex<HashMap<u64, ThreadsafeFunction<InstanceWork>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// ---------------------------------------------------------------------------
// Per-instance work dispatch via TSFN (no more Condvar work queue)
// ---------------------------------------------------------------------------

enum InstanceWork {
    Transform {
        program_ptr: u32,
        program_len: u32,
        unresolved_mark: u32,
        comments_proxy: u32,
        reply: mpsc::SyncSender<anyhow::Result<i32>>,
    },
    GetDiag {
        reply: mpsc::SyncSender<anyhow::Result<i32>>,
    },
    ReadMemory {
        ptr: u32,
        len: u32,
        reply: mpsc::SyncSender<anyhow::Result<Vec<u8>>>,
    },
    WriteMemory {
        ptr: u32,
        data: Vec<u8>,
        reply: mpsc::SyncSender<anyhow::Result<()>>,
    },
    Alloc {
        size: u32,
        reply: mpsc::SyncSender<anyhow::Result<u32>>,
    },
    Free {
        ptr: u32,
        size: u32,
        reply: mpsc::SyncSender<anyhow::Result<u32>>,
    },
}

// SAFETY: All fields are Send (mpsc::SyncSender is Send).
unsafe impl Send for InstanceWork {}

/// Dispatch work to an instance's worker thread via its TSFN and block for the result.
fn instance_call_blocking<T: Send + 'static>(
    instance_id: u64,
    work_fn: impl FnOnce(mpsc::SyncSender<anyhow::Result<T>>) -> InstanceWork,
) -> anyhow::Result<T> {
    let tsfns = INSTANCE_TSFNS.lock().unwrap();
    let tsfn = tsfns
        .get(&instance_id)
        .ok_or_else(|| anyhow::anyhow!("No TSFN for instance {}", instance_id))?;
    let (tx, rx) = mpsc::sync_channel(1);
    let work = work_fn(tx);
    let status = tsfn.call(Ok(work), ThreadsafeFunctionCallMode::Blocking);
    drop(tsfns); // Release lock before blocking
    if !matches!(status, Status::Ok) {
        anyhow::bail!("Instance TSFN call failed with status: {:?}", status);
    }
    rx.recv()
        .map_err(|e| anyhow::anyhow!("Instance TSFN recv failed: {}", e))?
}

// ---------------------------------------------------------------------------
// NAPI exports for worker threads
// ---------------------------------------------------------------------------

/// Called by worker after WASM instantiation to register a dispatch callback.
///
/// The `ops` object must have these methods:
///   - transform(programPtr, programLen, unresolvedMark, commentsProxy) → number
///   - getDiag() → number
///   - readBuf(ptr, len) → Buffer
///   - writeBuf(ptr, data: Buffer) → void
///   - alloc(size) → number
///   - free(ptr, size) → number
///
/// A TSFN is created targeting this worker's event loop. When Rust needs to
/// call a WASM export, it posts to this TSFN, which runs the appropriate
/// method on `ops` and sends the result back via a sync channel.
#[napi_derive::napi]
pub fn wasm_worker_register_callback(
    env: Env,
    instance_id: f64,
    ops: JsObject,
) -> napi::Result<()> {
    let id = instance_id as u64;

    // Extract and ref each function up front so we don't do property lookups on every call.
    let transform_fn: JsFunction = ops.get_named_property("transform")?;
    let diag_fn: JsFunction = ops.get_named_property("getDiag")?;
    let read_fn: JsFunction = ops.get_named_property("readBuf")?;
    let write_fn: JsFunction = ops.get_named_property("writeBuf")?;
    let alloc_fn: JsFunction = ops.get_named_property("alloc")?;
    let free_fn: JsFunction = ops.get_named_property("free")?;

    let transform_ref = env.create_reference(&transform_fn)?;
    let diag_ref = env.create_reference(&diag_fn)?;
    let read_ref = env.create_reference(&read_fn)?;
    let write_ref = env.create_reference(&write_fn)?;
    let alloc_ref = env.create_reference(&alloc_fn)?;
    let free_ref = env.create_reference(&free_fn)?;

    // We need a JsFunction to create the TSFN from. Create a no-op.
    let dummy_fn = env.create_function_from_closure("__instance_tsfn_noop", |ctx| {
        ctx.env.get_undefined().map(|v| v.into_unknown())
    })?;

    let tsfn: ThreadsafeFunction<InstanceWork> = dummy_fn.create_threadsafe_function(
        0,
        move |ctx: ThreadSafeCallContext<InstanceWork>| {
            let env = &ctx.env;

            match ctx.value {
                InstanceWork::Transform {
                    program_ptr,
                    program_len,
                    unresolved_mark,
                    comments_proxy,
                    reply,
                } => {
                    let f: JsFunction = env.get_reference_value(&transform_ref)?;
                    let result = f.call(
                        None,
                        &[
                            env.create_uint32(program_ptr)?.into_unknown(),
                            env.create_uint32(program_len)?.into_unknown(),
                            env.create_uint32(unresolved_mark)?.into_unknown(),
                            env.create_uint32(comments_proxy)?.into_unknown(),
                        ],
                    );
                    match result {
                        Ok(val) => {
                            let n: JsNumber = val.try_into()?;
                            let _ = reply.send(Ok(n.get_int32()?));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(anyhow::anyhow!("{}", e)));
                        }
                    }
                }
                InstanceWork::GetDiag { reply } => {
                    let f: JsFunction = env.get_reference_value(&diag_ref)?;
                    let result = f.call::<JsUnknown>(None, &[]);
                    match result {
                        Ok(val) => {
                            let n: JsNumber = val.try_into()?;
                            let _ = reply.send(Ok(n.get_int32()?));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(anyhow::anyhow!("{}", e)));
                        }
                    }
                }
                InstanceWork::ReadMemory { ptr, len, reply } => {
                    let f: JsFunction = env.get_reference_value(&read_ref)?;
                    let result = f.call(
                        None,
                        &[
                            env.create_uint32(ptr)?.into_unknown(),
                            env.create_uint32(len)?.into_unknown(),
                        ],
                    );
                    match result {
                        Ok(val) => {
                            let buffer: JsBuffer = val.try_into()?;
                            let data = buffer.into_value()?;
                            let _ = reply.send(Ok(data.to_vec()));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(anyhow::anyhow!("{}", e)));
                        }
                    }
                }
                InstanceWork::WriteMemory { ptr, data, reply } => {
                    let f: JsFunction = env.get_reference_value(&write_ref)?;
                    let js_buf = env.create_buffer_with_data(data)?.into_raw();
                    let result = f.call(
                        None,
                        &[
                            env.create_uint32(ptr)?.into_unknown(),
                            js_buf.into_unknown(),
                        ],
                    );
                    match result {
                        Ok(_) => {
                            let _ = reply.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(anyhow::anyhow!("{}", e)));
                        }
                    }
                }
                InstanceWork::Alloc { size, reply } => {
                    let f: JsFunction = env.get_reference_value(&alloc_ref)?;
                    let result = f.call(None, &[env.create_uint32(size)?.into_unknown()]);
                    match result {
                        Ok(val) => {
                            let n: JsNumber = val.try_into()?;
                            let _ = reply.send(Ok(n.get_uint32()?));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(anyhow::anyhow!("{}", e)));
                        }
                    }
                }
                InstanceWork::Free { ptr, size, reply } => {
                    let f: JsFunction = env.get_reference_value(&free_ref)?;
                    let result = f.call(
                        None,
                        &[
                            env.create_uint32(ptr)?.into_unknown(),
                            env.create_uint32(size)?.into_unknown(),
                        ],
                    );
                    match result {
                        Ok(val) => {
                            let n: JsNumber = val.try_into()?;
                            let _ = reply.send(Ok(n.get_uint32()?));
                        }
                        Err(e) => {
                            let _ = reply.send(Err(anyhow::anyhow!("{}", e)));
                        }
                    }
                }
            }
            Ok(Vec::<JsUnknown>::new())
        },
    )?;

    INSTANCE_TSFNS.lock().unwrap().insert(id, tsfn);
    Ok(())
}

/// Called by worker when WASM hits a host function import.
/// Runs the Func closure synchronously on the worker thread and returns the result.
///
/// The worker provides a `memoryAccessor` object with methods to read/write WASM memory:
///   - readBuf(ptr, len) → Buffer
///   - writeBuf(ptr, data: Buffer) → void
///   - alloc(size) → number
///   - free(ptr, size) → number
#[napi_derive::napi]
pub fn wasm_worker_dispatch_host_fn(
    env: Env,
    instance_id: f64,
    fn_index: u32,
    args: Vec<i32>,
    memory_accessor: JsObject,
) -> napi::Result<JsUnknown> {
    let id = instance_id as u64;
    let fns = HOST_FNS.lock().unwrap();
    let host_functions = fns
        .get(&id)
        .ok_or_else(|| napi::Error::from_reason(format!("No host fns for instance {}", id)))?
        .clone();
    drop(fns); // Release lock before calling the closure

    let fn_index = fn_index as usize;
    if fn_index >= host_functions.len() {
        return Err(napi::Error::from_reason(format!(
            "Host fn index {} out of range (max {})",
            fn_index,
            host_functions.len()
        )));
    }

    let func = &host_functions[fn_index];
    let result_count = func.sign.1 as usize;

    let mut caller = NapiDirectCaller {
        env: &env,
        accessor: &memory_accessor,
    };

    let mut output = vec![0i32; result_count];
    (func.func)(&mut caller, &args, &mut output);

    if result_count == 0 {
        env.get_undefined().map(|v| v.into_unknown())
    } else {
        env.create_int32(output[0]).map(|v| v.into_unknown())
    }
}

// ---------------------------------------------------------------------------
// NapiDirectCaller: memory ops via direct NAPI calls on the worker thread
// ---------------------------------------------------------------------------

struct NapiDirectCaller<'a> {
    env: &'a Env,
    accessor: &'a JsObject,
}

impl<'a> runtime::Caller<'a> for NapiDirectCaller<'a> {
    fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
        let read_fn: JsFunction = self.accessor.get_named_property("readBuf")?;
        let result = read_fn.call(
            None,
            &[
                self.env.create_uint32(ptr)?.into_unknown(),
                self.env.create_uint32(buf.len() as u32)?.into_unknown(),
            ],
        )?;
        let buffer: JsBuffer = result.try_into()?;
        let data = buffer.into_value()?;
        buf.copy_from_slice(&data);
        Ok(())
    }

    fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
        let write_fn: JsFunction = self.accessor.get_named_property("writeBuf")?;
        let js_buf = self.env.create_buffer_with_data(buf.to_vec())?.into_raw();
        write_fn.call(
            None,
            &[
                self.env.create_uint32(ptr)?.into_unknown(),
                js_buf.into_unknown(),
            ],
        )?;
        Ok(())
    }

    fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
        let alloc_fn: JsFunction = self.accessor.get_named_property("alloc")?;
        let result = alloc_fn.call(None, &[self.env.create_uint32(size)?.into_unknown()])?;
        let n: JsNumber = result.try_into()?;
        Ok(n.get_uint32()?)
    }

    fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
        let free_fn: JsFunction = self.accessor.get_named_property("free")?;
        let result = free_fn.call(
            None,
            &[
                self.env.create_uint32(ptr)?.into_unknown(),
                self.env.create_uint32(size)?.into_unknown(),
            ],
        )?;
        let n: JsNumber = result.try_into()?;
        Ok(n.get_uint32()?)
    }
}

// ---------------------------------------------------------------------------
// TSFN request types (main-thread operations only)
// ---------------------------------------------------------------------------

enum WasmRequest {
    CompileModule {
        wasm_bytes: Vec<u8>,
        reply: mpsc::SyncSender<anyhow::Result<u64>>,
    },
    CloneModule {
        module_id: u64,
        reply: mpsc::SyncSender<anyhow::Result<u64>>,
    },
    /// Instantiate a module on a worker. Returns instance_id.
    Instantiate {
        module_id: u64,
        host_fn_descriptors: Vec<HostFnDescriptor>,
        reply: mpsc::SyncSender<anyhow::Result<u64>>,
    },
    DropModule {
        module_id: u64,
    },
    DropInstance {
        instance_id: u64,
    },
}

// SAFETY: All fields are Send.
unsafe impl Send for WasmRequest {}

struct HostFnDescriptor {
    name: String,
    param_count: u8,
    result_count: u8,
    index: usize,
}

// ---------------------------------------------------------------------------
// TSFN registration
// ---------------------------------------------------------------------------

pub fn register_wasm_runtime(env: &Env, js_manager: &JsObject) -> napi::Result<()> {
    let env_addr = env.raw() as usize;

    // Idempotent: skip if already registered from the same Env.
    if WASM_TSFN.get().is_some() {
        let registered_env = WASM_TSFN_ENV.get().copied().unwrap_or(0);
        assert_eq!(
            registered_env, env_addr,
            "WASM runtime already registered from a different napi_env"
        );
        return Ok(());
    }

    let mut global = env.get_global()?;
    global.set_named_property("__nextSwcWasmManager", js_manager)?;

    // Initialize worker pool (no SABs — workers load native addon directly).
    let init_fn: JsFunction = js_manager.get_named_property("initWorkerPool")?;
    let worker_count = num_cpus().max(1);
    init_fn.call(
        None,
        &[env.create_uint32(worker_count as u32)?.into_unknown()],
    )?;

    // Create TSFN for main-thread operations.
    let dummy_fn = env.create_function_from_closure("__wasm_tsfn_noop", |ctx| {
        ctx.env.get_undefined().map(|v| v.into_unknown())
    })?;

    let tsfn: ThreadsafeFunction<WasmRequest> =
        dummy_fn.create_threadsafe_function(0, |ctx: ThreadSafeCallContext<WasmRequest>| {
            let global = ctx.env.get_global()?;
            let manager: JsObject = global.get_named_property("__nextSwcWasmManager")?;
            handle_wasm_request(&ctx.env, &manager, ctx.value)?;
            Ok(Vec::<JsUnknown>::new())
        })?;

    WASM_TSFN
        .set(tsfn)
        .map_err(|_| napi::Error::from_reason("WASM TSFN already registered"))?;
    let _ = WASM_TSFN_ENV.set(env_addr);

    Ok(())
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

// ---------------------------------------------------------------------------
// TSFN callback (runs on main JS thread)
// ---------------------------------------------------------------------------

fn handle_wasm_request(env: &Env, manager: &JsObject, request: WasmRequest) -> napi::Result<()> {
    match request {
        WasmRequest::CompileModule { wasm_bytes, reply } => {
            let result = compile_module_js(env, manager, wasm_bytes);
            let _ = reply.send(result);
        }

        WasmRequest::CloneModule { module_id, reply } => {
            let result = clone_module_js(env, manager, module_id);
            let _ = reply.send(result);
        }

        WasmRequest::Instantiate {
            module_id,
            host_fn_descriptors,
            reply,
        } => {
            let result = instantiate_js(env, manager, module_id, host_fn_descriptors, reply);
            if let Err(e) = result {
                eprintln!("[napi-wasm] Instantiate setup failed: {}", e);
            }
        }

        WasmRequest::DropModule { module_id } => {
            let drop_fn: JsFunction = manager.get_named_property("dropModule")?;
            drop_fn.call(None, &[env.create_double(module_id as f64)?.into_unknown()])?;
        }

        WasmRequest::DropInstance { instance_id } => {
            // Remove the per-instance TSFN (signals worker to stop receiving work)
            {
                let mut tsfns = INSTANCE_TSFNS.lock().unwrap();
                tsfns.remove(&instance_id);
            }

            // Clean up host functions
            HOST_FNS.lock().unwrap().remove(&instance_id);

            let drop_fn: JsFunction = manager.get_named_property("dropInstance")?;
            drop_fn.call(
                None,
                &[env.create_double(instance_id as f64)?.into_unknown()],
            )?;
        }
    }
    Ok(())
}

fn tsfn_call_blocking<T: Send + 'static>(
    request_fn: impl FnOnce(mpsc::SyncSender<T>) -> WasmRequest,
) -> anyhow::Result<T> {
    let tsfn = WASM_TSFN
        .get()
        .ok_or_else(|| anyhow::anyhow!("WASM TSFN not registered"))?;
    let (tx, rx) = mpsc::sync_channel(1);
    let request = request_fn(tx);
    let status = tsfn.call(Ok(request), ThreadsafeFunctionCallMode::Blocking);
    if !matches!(status, Status::Ok) {
        anyhow::bail!("TSFN call failed with status: {:?}", status);
    }
    rx.recv()
        .map_err(|e| anyhow::anyhow!("TSFN recv failed: {}", e))
}

// ---------------------------------------------------------------------------
// JS manager method implementations (all on main thread)
// ---------------------------------------------------------------------------

fn compile_module_js(env: &Env, manager: &JsObject, wasm_bytes: Vec<u8>) -> anyhow::Result<u64> {
    let compile_fn: JsFunction = manager.get_named_property("compileModule")?;
    let buffer = env.create_buffer_with_data(wasm_bytes)?.into_raw();
    let result = compile_fn.call(None, &[buffer])?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_double()? as u64)
}

fn clone_module_js(env: &Env, manager: &JsObject, module_id: u64) -> anyhow::Result<u64> {
    let clone_fn: JsFunction = manager.get_named_property("cloneModule")?;
    let result = clone_fn.call(None, &[env.create_double(module_id as f64)?.into_unknown()])?;
    let result: JsNumber = result.try_into()?;
    Ok(result.get_double()? as u64)
}

fn instantiate_js(
    env: &Env,
    manager: &JsObject,
    module_id: u64,
    host_fn_descriptors: Vec<HostFnDescriptor>,
    reply: mpsc::SyncSender<anyhow::Result<u64>>,
) -> napi::Result<()> {
    // Each descriptor is a [name, paramCount, resultCount, index] tuple —
    // arrays are faster to construct and serialize than objects.
    let mut descriptors_arr = env.create_array_with_length(host_fn_descriptors.len())?;
    for (i, desc) in host_fn_descriptors.iter().enumerate() {
        let mut tuple = env.create_array_with_length(4)?;
        tuple.set_element(0, env.create_string(&desc.name)?)?;
        tuple.set_element(1, env.create_int32(desc.param_count as i32)?)?;
        tuple.set_element(2, env.create_int32(desc.result_count as i32)?)?;
        tuple.set_element(3, env.create_int32(desc.index as i32)?)?;
        descriptors_arr.set_element(i as u32, tuple)?;
    }

    // Single callback: JS calls with a number (instanceId) on success,
    // or a string (error message) on failure.
    let callback = env.create_function_from_closure("callback", move |ctx| {
        let result: JsUnknown = ctx.get(0)?;
        match result.get_type()? {
            napi::ValueType::Number => {
                let n: JsNumber = result.try_into()?;
                let _ = reply.send(Ok(n.get_double()? as u64));
            }
            _ => {
                let s: napi::JsString = result.try_into()?;
                let msg = s.into_utf8()?.as_str()?.to_owned();
                let _ = reply.send(Err(anyhow::anyhow!("Instantiate failed: {}", msg)));
            }
        }
        ctx.env.get_undefined()
    })?;

    let instantiate_fn: JsFunction = manager.get_named_property("instantiateOnWorker")?;
    instantiate_fn.call(
        None,
        &[
            env.create_double(module_id as f64)?.into_unknown(),
            unsafe { JsUnknown::from_raw_unchecked(env.raw(), descriptors_arr.raw()) },
            callback.into_unknown(),
        ],
    )?;

    Ok(())
}

// ---------------------------------------------------------------------------
// NapiRuntime: implements swc_plugin_runner::runtime::Runtime
// ---------------------------------------------------------------------------

struct NapiModuleCache {
    module_id: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct NapiRuntime;

impl runtime::Runtime for NapiRuntime {
    fn identifier(&self) -> &'static str {
        NAPI_RUNTIME_ID
    }

    fn prepare_module(&self, bytes: &[u8]) -> anyhow::Result<runtime::ModuleCache> {
        let wasm_bytes = bytes.to_vec();
        let module_id =
            tsfn_call_blocking(|reply| WasmRequest::CompileModule { wasm_bytes, reply })??;
        Ok(runtime::ModuleCache(Box::new(NapiModuleCache {
            module_id,
        })))
    }

    fn init(
        &self,
        _name: &str,
        imports: Vec<(String, runtime::Func)>,
        _envs: Vec<(String, String)>,
        module: runtime::Module,
    ) -> anyhow::Result<Box<dyn runtime::Instance>> {
        let module_id = match module {
            runtime::Module::Cache(cache) => {
                cache.0.downcast::<NapiModuleCache>().unwrap().module_id
            }
            runtime::Module::Bytes(buf) => {
                let wasm_bytes = buf.to_vec();
                tsfn_call_blocking(|reply| WasmRequest::CompileModule { wasm_bytes, reply })??
            }
        };

        let mut host_fn_descriptors = Vec::with_capacity(imports.len());
        let mut host_functions = Vec::with_capacity(imports.len());
        for (i, (name, func)) in imports.into_iter().enumerate() {
            host_fn_descriptors.push(HostFnDescriptor {
                name,
                param_count: func.sign.0,
                result_count: func.sign.1,
                index: i,
            });
            host_functions.push(func);
        }
        let host_functions = Arc::new(host_functions);

        // Instantiate on a worker thread via TSFN → postMessage.
        // The worker will call wasmWorkerRegisterCallback to set up the per-instance TSFN.
        let instance_id = tsfn_call_blocking(|reply| WasmRequest::Instantiate {
            module_id,
            host_fn_descriptors,
            reply,
        })??;

        // Store host functions so worker can call them via NAPI.
        HOST_FNS.lock().unwrap().insert(instance_id, host_functions);

        let mut instance = NapiInstance {
            instance_id,
            module_id,
        };

        // The runtime contract requires calling __get_transform_plugin_core_pkg_diag
        // after instantiation to populate diagnostics.
        instance.get_diag()?;

        Ok(Box::new(instance))
    }

    fn clone_cache(&self, cache: &runtime::ModuleCache) -> Option<runtime::ModuleCache> {
        let cache = cache.0.downcast_ref::<NapiModuleCache>()?;
        let module_id = tsfn_call_blocking(|reply| WasmRequest::CloneModule {
            module_id: cache.module_id,
            reply,
        })
        .ok()?
        .ok()?;
        Some(runtime::ModuleCache(Box::new(NapiModuleCache {
            module_id,
        })))
    }

    unsafe fn load_cache(&self, _path: &Path) -> Option<runtime::ModuleCache> {
        None
    }

    fn store_cache(&self, _path: &Path, _cache: &runtime::ModuleCache) -> anyhow::Result<()> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// NapiInstance
// ---------------------------------------------------------------------------

struct NapiInstance {
    instance_id: u64,
    module_id: u64,
}

unsafe impl Sync for NapiInstance {}

impl runtime::Instance for NapiInstance {
    fn transform(
        &mut self,
        program_ptr: u32,
        program_len: u32,
        unresolved_mark: u32,
        should_enable_comments_proxy: u32,
    ) -> anyhow::Result<u32> {
        let result = instance_call_blocking(self.instance_id, |reply| InstanceWork::Transform {
            program_ptr,
            program_len,
            unresolved_mark,
            comments_proxy: should_enable_comments_proxy,
            reply,
        })?;

        if result == -1 {
            anyhow::bail!("Transform failed in worker");
        }
        Ok(result as u32)
    }

    fn caller(&mut self) -> anyhow::Result<Box<dyn runtime::Caller<'_> + '_>> {
        Ok(Box::new(TsfnCaller {
            instance_id: self.instance_id,
        }))
    }

    fn cache(&self) -> Option<runtime::ModuleCache> {
        None
    }
}

impl NapiInstance {
    fn get_diag(&mut self) -> anyhow::Result<u32> {
        let result =
            instance_call_blocking(self.instance_id, |reply| InstanceWork::GetDiag { reply })?;

        if result == -1 {
            anyhow::bail!("getDiag failed in worker");
        }
        Ok(result as u32)
    }
}

impl Drop for NapiInstance {
    fn drop(&mut self) {
        if let Some(tsfn) = WASM_TSFN.get() {
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

// ---------------------------------------------------------------------------
// TsfnCaller: memory ops via per-instance TSFN
// ---------------------------------------------------------------------------

struct TsfnCaller {
    instance_id: u64,
}

impl<'a> runtime::Caller<'a> for TsfnCaller {
    fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
        let len = buf.len() as u32;
        let data = instance_call_blocking(self.instance_id, |reply| InstanceWork::ReadMemory {
            ptr,
            len,
            reply,
        })?;
        buf.copy_from_slice(&data);
        Ok(())
    }

    fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
        instance_call_blocking(self.instance_id, |reply| InstanceWork::WriteMemory {
            ptr,
            data: buf.to_vec(),
            reply,
        })
    }

    fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
        instance_call_blocking(self.instance_id, |reply| InstanceWork::Alloc {
            size,
            reply,
        })
    }

    fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
        instance_call_blocking(self.instance_id, |reply| InstanceWork::Free {
            ptr,
            size,
            reply,
        })
    }
}
