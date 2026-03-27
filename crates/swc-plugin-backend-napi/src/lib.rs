use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
        mpsc,
    },
};

use atomic_wait::{wait, wake_one};
use napi::{
    Env, JsBuffer, JsFunction, JsNumber, JsObject, JsUnknown, NapiRaw, NapiValue, Status,
    threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use once_cell::sync::OnceCell;
use swc_plugin_runner::runtime;

/// Identifier for cache stored in local filesystem.
const NAPI_RUNTIME_ID: &str = "napi-v8-v1";

/// Global TSFN for dispatching setup operations to the JS main thread.
/// Transforms bypass this entirely and go directly to workers via Atomics.
static WASM_TSFN: OnceCell<ThreadsafeFunction<WasmRequest>> = OnceCell::new();

/// Worker shared memory regions, indexed by worker_index.
static WORKERS: OnceCell<Vec<WorkerSharedMem>> = OnceCell::new();

// ---------------------------------------------------------------------------
// Shared memory layout constants (must match wasm-worker.ts)
// ---------------------------------------------------------------------------

const FLAG: usize = 0;

// Transform request/response (ctrl indices 1-6):
const INSTANCE_ID: usize = 1;
const PROGRAM_PTR: usize = 2;
const PROGRAM_LEN: usize = 3;
const UNRESOLVED_MARK: usize = 4;
const COMMENTS_PROXY: usize = 5;
const TRANSFORM_RESULT: usize = 6;

// Host function callback (ctrl indices 7-9, args at 10+):
const HOST_FN_INDEX: usize = 7;
const HOST_FN_PARAM_COUNT: usize = 8;
const HOST_FN_RESULT_COUNT: usize = 9;
const HOST_FN_ARGS_START: usize = 10;

// Memory operation (ctrl indices 7-10, reuses host fn space since they're exclusive):
const MEM_OP_TYPE: usize = 7;
const MEM_OP_PTR: usize = 8;
const MEM_OP_LEN: usize = 9;
const MEM_OP_RESULT: usize = 10;

// Flag values (stored as u32 in Rust, i32 in JS — same bit pattern):
const IDLE: u32 = 0;
const TRANSFORM_REQ: u32 = 1;
const TRANSFORM_RESP: u32 = 2;
const HOST_FN_REQ: u32 = 3;
const HOST_FN_RESP: u32 = 4;
const MEM_OP_REQ: u32 = 5;
const MEM_OP_RESP: u32 = 6;

// Memory op types:
const MEM_READ: u32 = 1;
const MEM_WRITE: u32 = 2;
const MEM_ALLOC: u32 = 3;
const MEM_FREE: u32 = 4;

// ---------------------------------------------------------------------------
// Worker shared memory
// ---------------------------------------------------------------------------

struct WorkerSharedMem {
    /// Pointer to the control SharedArrayBuffer (treated as u32 slots).
    /// JS uses Int32Array (i32) but the bit patterns are identical for our
    /// small non-negative flag values and we only use atomic ops.
    ctrl: *mut u32,
    ctrl_len: usize, // number of u32 slots
    data: *mut u8,
    data_len: usize,
}

// SAFETY: SharedArrayBuffer memory is shared between Rust and JS worker threads.
// Access is synchronized via atomic operations (futex-based wait/wake).
unsafe impl Send for WorkerSharedMem {}
unsafe impl Sync for WorkerSharedMem {}

impl WorkerSharedMem {
    fn flag(&self) -> &AtomicU32 {
        self.atomic(FLAG)
    }

    fn atomic(&self, index: usize) -> &AtomicU32 {
        assert!(index < self.ctrl_len);
        unsafe { &*(self.ctrl.add(index) as *const AtomicU32) }
    }

    fn store(&self, index: usize, value: u32) {
        self.atomic(index).store(value, Ordering::Release);
    }

    fn load(&self, index: usize) -> u32 {
        self.atomic(index).load(Ordering::Acquire)
    }

    /// Block until flag != expected. Uses futex (same as Atomics.wait in V8).
    fn wait_flag_change(&self, expected: u32) {
        loop {
            let current = self.flag().load(Ordering::Acquire);
            if current != expected {
                return;
            }
            wait(self.flag(), expected);
        }
    }

    /// Wake one waiter on the flag. Uses futex (same as Atomics.notify in V8).
    fn notify_flag(&self) {
        wake_one(self.flag());
    }

    fn read_data(&self, buf: &mut [u8]) {
        assert!(buf.len() <= self.data_len);
        unsafe {
            std::ptr::copy_nonoverlapping(self.data, buf.as_mut_ptr(), buf.len());
        }
    }

    fn write_data(&self, buf: &[u8]) {
        assert!(buf.len() <= self.data_len);
        unsafe {
            std::ptr::copy_nonoverlapping(buf.as_ptr(), self.data, buf.len());
        }
    }
}

// ---------------------------------------------------------------------------
// TSFN request types (setup operations only — transforms bypass TSFN)
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
    /// Instantiate a module on a worker. Returns (instance_id, worker_index).
    /// The TSFN callback sends the request to the worker via postMessage and
    /// stores the reply sender. The worker's response (via the manager's
    /// message handler) completes the reply.
    Instantiate {
        module_id: u64,
        host_fn_descriptors: Vec<HostFnDescriptor>,
        reply: mpsc::SyncSender<anyhow::Result<(u64, usize)>>,
    },
    /// Async operations on worker instances (go through postMessage).
    WorkerOp {
        instance_id: u64,
        op: WorkerOp,
    },
    DropModule {
        module_id: u64,
    },
    DropInstance {
        instance_id: u64,
    },
}

enum WorkerOp {
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
    GetDiag {
        reply: mpsc::SyncSender<anyhow::Result<u32>>,
    },
}

// SAFETY: All fields are Send.
unsafe impl Send for WasmRequest {}
unsafe impl Send for WorkerOp {}

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
    let mut global = env.get_global()?;
    global.set_named_property("__nextSwcWasmManager", js_manager)?;

    // Initialize worker pool.
    let init_fn: JsFunction = js_manager.get_named_property("initWorkerPool")?;
    let worker_count = num_cpus().max(1);
    let worker_configs = init_fn.call(
        None,
        &[env.create_uint32(worker_count as u32)?.into_unknown()],
    )?;
    let worker_configs: JsObject = worker_configs.try_into()?;

    let mut worker_mems = Vec::with_capacity(worker_count);
    for i in 0..worker_count {
        let config: JsObject = worker_configs.get_element(i as u32)?;
        let ctrl_sab: JsObject = config.get_named_property("ctrlBuffer")?;
        let data_sab: JsObject = config.get_named_property("dataBuffer")?;

        let (ctrl_ptr, ctrl_byte_len) = get_sab_info(env, &ctrl_sab)?;
        let (data_ptr, data_byte_len) = get_sab_info(env, &data_sab)?;

        worker_mems.push(WorkerSharedMem {
            ctrl: ctrl_ptr as *mut u32,
            ctrl_len: ctrl_byte_len / 4,
            data: data_ptr as *mut u8,
            data_len: data_byte_len,
        });
    }

    WORKERS
        .set(worker_mems)
        .map_err(|_| napi::Error::from_reason("Workers already registered"))?;

    // Create TSFN for setup operations.
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

    Ok(())
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

fn get_sab_info(env: &Env, sab: &JsObject) -> napi::Result<(*mut u8, usize)> {
    let mut data = std::ptr::null_mut();
    let mut len = 0;
    let status =
        unsafe { napi::sys::napi_get_arraybuffer_info(env.raw(), sab.raw(), &mut data, &mut len) };
    if status != napi::sys::Status::napi_ok {
        return Err(napi::Error::from_reason(format!(
            "Failed to get SharedArrayBuffer info: {:?}",
            status
        )));
    }
    Ok((data as *mut u8, len))
}

// ---------------------------------------------------------------------------
// TSFN callback
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
            // This calls instantiateOnWorker which returns sync metadata +
            // an async promise for the actual instantiation. We register
            // a promise callback to complete the reply.
            let result = instantiate_js(env, manager, module_id, host_fn_descriptors, reply);
            if let Err(e) = result {
                // If setup failed, the reply was already consumed or needs to be sent.
                // Just log — reply sender was moved into instantiate_js.
                eprintln!("Instantiate setup failed: {}", e);
            }
        }

        WasmRequest::WorkerOp { instance_id, op } => {
            handle_worker_op(env, manager, instance_id, op);
        }

        WasmRequest::DropModule { module_id } => {
            let drop_fn: JsFunction = manager.get_named_property("dropModule")?;
            drop_fn.call(None, &[env.create_double(module_id as f64)?.into_unknown()])?;
        }

        WasmRequest::DropInstance { instance_id } => {
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
    reply: mpsc::SyncSender<anyhow::Result<(u64, usize)>>,
) -> napi::Result<()> {
    let mut descriptors_arr = env.create_array_with_length(host_fn_descriptors.len())?;
    for (i, desc) in host_fn_descriptors.iter().enumerate() {
        let mut obj = env.create_object()?;
        obj.set_named_property("name", env.create_string(&desc.name)?)?;
        obj.set_named_property("paramCount", env.create_int32(desc.param_count as i32)?)?;
        obj.set_named_property("resultCount", env.create_int32(desc.result_count as i32)?)?;
        obj.set_named_property("index", env.create_int32(desc.index as i32)?)?;
        descriptors_arr.set_element(i as u32, obj)?;
    }

    let instantiate_fn: JsFunction = manager.get_named_property("instantiateOnWorker")?;
    let result = instantiate_fn.call(
        None,
        &[
            env.create_double(module_id as f64)?.into_unknown(),
            unsafe { JsUnknown::from_raw_unchecked(env.raw(), descriptors_arr.raw()) },
        ],
    )?;

    let result: JsObject = result.try_into()?;
    let instance_id: JsNumber = result.get_named_property("instanceId")?;
    let worker_index: JsNumber = result.get_named_property("workerIndex")?;
    let instance_id_val = instance_id.get_double()? as u64;
    let worker_index_val = worker_index.get_uint32()? as usize;

    // The promise resolves when the worker finishes instantiation.
    // Attach .then() to send the reply when ready.
    let promise: JsObject = result.get_named_property("promise")?;
    let then_fn: JsFunction = promise.get_named_property("then")?;

    let reply_ok = reply.clone();
    let resolve_cb = env.create_function_from_closure("resolve", move |ctx| {
        let _ = reply_ok.send(Ok((instance_id_val, worker_index_val)));
        ctx.env.get_undefined()
    })?;

    let reject_cb = env.create_function_from_closure("reject", move |ctx| {
        let err: JsUnknown = ctx.get(0)?;
        let msg = err
            .coerce_to_string()
            .and_then(|s| s.into_utf8()?.as_str().map(|s| s.to_owned()))
            .unwrap_or_else(|_| "unknown error".to_string());
        let _ = reply.send(Err(anyhow::anyhow!("Instantiate failed: {}", msg)));
        ctx.env.get_undefined()
    })?;

    then_fn.call(
        Some(&promise),
        &[resolve_cb.into_unknown(), reject_cb.into_unknown()],
    )?;

    Ok(())
}

/// Handle async worker operations. These go through the manager's postMessage
/// methods which return promises. We attach .then() to complete the reply.
fn handle_worker_op(env: &Env, manager: &JsObject, instance_id: u64, op: WorkerOp) {
    let result = match op {
        WorkerOp::ReadMemory { ptr, len, reply } => handle_promise_op(
            env,
            manager,
            "readMemoryAsync",
            instance_id,
            reply,
            |env, args| {
                args.push(env.create_uint32(ptr)?.into_unknown());
                args.push(env.create_uint32(len)?.into_unknown());
                Ok(())
            },
            |_env, val| {
                let buf: JsBuffer = val.try_into()?;
                Ok(buf.into_value()?.to_vec())
            },
        ),
        WorkerOp::WriteMemory { ptr, data, reply } => handle_promise_op(
            env,
            manager,
            "writeMemoryAsync",
            instance_id,
            reply,
            |env, args| {
                args.push(env.create_uint32(ptr)?.into_unknown());
                let buffer = env.create_buffer_with_data(data)?.into_raw();
                args.push(buffer.into_unknown());
                Ok(())
            },
            |_env, _val| Ok(()),
        ),
        WorkerOp::Alloc { size, reply } => handle_promise_op(
            env,
            manager,
            "allocAsync",
            instance_id,
            reply,
            |env, args| {
                args.push(env.create_uint32(size)?.into_unknown());
                Ok(())
            },
            |_env, val| {
                let n: JsNumber = val.try_into()?;
                Ok(n.get_uint32()?)
            },
        ),
        WorkerOp::Free { ptr, size, reply } => handle_promise_op(
            env,
            manager,
            "freeAsync",
            instance_id,
            reply,
            |env, args| {
                args.push(env.create_uint32(ptr)?.into_unknown());
                args.push(env.create_uint32(size)?.into_unknown());
                Ok(())
            },
            |_env, val| {
                let n: JsNumber = val.try_into()?;
                Ok(n.get_uint32()?)
            },
        ),
        WorkerOp::GetDiag { reply } => handle_promise_op(
            env,
            manager,
            "getDiagAsync",
            instance_id,
            reply,
            |_env, _args| Ok(()),
            |_env, val| {
                let n: JsNumber = val.try_into()?;
                Ok(n.get_uint32()?)
            },
        ),
    };

    if let Err(e) = result {
        eprintln!("Worker op setup failed: {}", e);
    }
}

fn handle_promise_op<T: Send + 'static>(
    env: &Env,
    manager: &JsObject,
    method: &str,
    instance_id: u64,
    reply: mpsc::SyncSender<anyhow::Result<T>>,
    setup_args: impl FnOnce(&Env, &mut Vec<JsUnknown>) -> napi::Result<()>,
    extract: impl Fn(&Env, JsUnknown) -> napi::Result<T> + Send + 'static,
) -> napi::Result<()> {
    let func: JsFunction = manager.get_named_property(method)?;
    let mut args: Vec<JsUnknown> = vec![env.create_double(instance_id as f64)?.into_unknown()];
    setup_args(env, &mut args)?;

    let promise = func.call(None, &args)?;
    let promise: JsObject = promise.try_into()?;
    let then_fn: JsFunction = promise.get_named_property("then")?;

    let reply_ok = reply.clone();
    let resolve_cb = env.create_function_from_closure("resolve", move |ctx| {
        let val: JsUnknown = ctx.get(0)?;
        let result = extract(ctx.env, val).map_err(|e| anyhow::anyhow!("{}", e));
        let _ = reply_ok.send(result);
        ctx.env.get_undefined()
    })?;

    let reject_cb = env.create_function_from_closure("reject", move |ctx| {
        let err: JsUnknown = ctx.get(0)?;
        let msg = err
            .coerce_to_string()
            .and_then(|s| s.into_utf8()?.as_str().map(|s| s.to_owned()))
            .unwrap_or_else(|_| "unknown error".to_string());
        let _ = reply.send(Err(anyhow::anyhow!("{}", msg)));
        ctx.env.get_undefined()
    })?;

    then_fn.call(
        Some(&promise),
        &[resolve_cb.into_unknown(), reject_cb.into_unknown()],
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

        // Instantiate on a worker thread. The reply comes back asynchronously
        // when the worker's promise resolves.
        let (instance_id, worker_index) = tsfn_call_blocking(|reply| WasmRequest::Instantiate {
            module_id,
            host_fn_descriptors,
            reply,
        })??;

        // getDiag handshake to verify the instance is ready.
        let _diag = tsfn_call_blocking(|reply| WasmRequest::WorkerOp {
            instance_id,
            op: WorkerOp::GetDiag { reply },
        })??;

        Ok(Box::new(NapiInstance {
            instance_id,
            module_id,
            worker_index,
            host_functions,
        }))
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
    worker_index: usize,
    host_functions: Arc<Vec<(String, runtime::Func)>>,
}

unsafe impl Sync for NapiInstance {}

impl NapiInstance {
    fn worker(&self) -> &WorkerSharedMem {
        &WORKERS.get().expect("Workers not initialized")[self.worker_index]
    }
}

impl runtime::Instance for NapiInstance {
    fn transform(
        &mut self,
        program_ptr: u32,
        program_len: u32,
        unresolved_mark: u32,
        should_enable_comments_proxy: u32,
    ) -> anyhow::Result<u32> {
        let w = self.worker();

        // Write transform args to shared memory.
        w.store(INSTANCE_ID, self.instance_id as u32);
        w.store(PROGRAM_PTR, program_ptr);
        w.store(PROGRAM_LEN, program_len);
        w.store(UNRESOLVED_MARK, unresolved_mark);
        w.store(COMMENTS_PROXY, should_enable_comments_proxy);

        // Signal worker.
        w.store(FLAG, TRANSFORM_REQ);
        w.notify_flag();

        // Process host function callbacks until transform completes.
        loop {
            w.wait_flag_change(TRANSFORM_REQ);
            let flag = w.load(FLAG);

            if flag == TRANSFORM_RESP {
                let result = w.load(TRANSFORM_RESULT);
                // Reset to IDLE for next operation.
                w.store(FLAG, IDLE);
                w.notify_flag();

                // Worker stores u32::MAX (0xFFFFFFFF, which is -1 as i32) on error
                if result == u32::MAX {
                    anyhow::bail!("Transform failed in worker");
                }
                return Ok(result);
            }

            if flag == HOST_FN_REQ {
                self.handle_host_fn_call(w)?;
                // After HOST_FN_RESP, the worker continues. Wait for next event.
                continue;
            }

            // Unexpected flag — bail
            anyhow::bail!("Unexpected flag during transform: {}", flag);
        }
    }

    fn caller(&mut self) -> anyhow::Result<Box<dyn runtime::Caller<'_> + '_>> {
        // Outside of transform, use TSFN-based caller (postMessage path).
        Ok(Box::new(TsfnCaller {
            instance_id: self.instance_id,
        }))
    }

    fn cache(&self) -> Option<runtime::ModuleCache> {
        None
    }
}

impl NapiInstance {
    fn handle_host_fn_call(&self, w: &WorkerSharedMem) -> anyhow::Result<()> {
        let fn_index = w.load(HOST_FN_INDEX) as usize;
        let param_count = w.load(HOST_FN_PARAM_COUNT) as usize;
        let result_count = w.load(HOST_FN_RESULT_COUNT) as usize;

        let mut input = vec![0i32; param_count];
        for i in 0..param_count {
            input[i] = w.load(HOST_FN_ARGS_START + i) as i32;
        }

        let (ref _name, ref func) = self.host_functions[fn_index];

        // The Caller for host function callbacks uses Atomics to proxy
        // memory operations to the worker.
        let mut caller = TransformCaller { worker: w };

        let mut output = vec![0i32; result_count];
        (func.func)(&mut caller, &input, &mut output);

        // Write results to shared memory.
        for (i, &v) in output.iter().enumerate() {
            w.store(HOST_FN_ARGS_START + i, v as u32);
        }

        // Signal worker that host function is complete.
        w.store(FLAG, HOST_FN_RESP);
        w.notify_flag();

        // Wait for worker to continue — it will set HOST_FN_REQ (another
        // callback) or TRANSFORM_RESP (done). The outer loop handles both.
        w.wait_flag_change(HOST_FN_RESP);

        Ok(())
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
// TransformCaller: memory ops via SharedArrayBuffer (during transform)
// ---------------------------------------------------------------------------

struct TransformCaller<'a> {
    worker: &'a WorkerSharedMem,
}

impl<'a> runtime::Caller<'a> for TransformCaller<'a> {
    fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
        let w = self.worker;

        w.store(MEM_OP_TYPE, MEM_READ);
        w.store(MEM_OP_PTR, ptr);
        w.store(MEM_OP_LEN, buf.len() as u32);

        w.store(FLAG, MEM_OP_REQ);
        w.notify_flag();
        w.wait_flag_change(MEM_OP_REQ);

        let flag = w.load(FLAG);
        if flag != MEM_OP_RESP {
            anyhow::bail!("Expected MEM_OP_RESP after read, got {}", flag);
        }

        w.read_data(buf);
        Ok(())
    }

    fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
        let w = self.worker;

        w.write_data(buf);

        w.store(MEM_OP_TYPE, MEM_WRITE);
        w.store(MEM_OP_PTR, ptr);
        w.store(MEM_OP_LEN, buf.len() as u32);

        w.store(FLAG, MEM_OP_REQ);
        w.notify_flag();
        w.wait_flag_change(MEM_OP_REQ);

        let flag = w.load(FLAG);
        if flag != MEM_OP_RESP {
            anyhow::bail!("Expected MEM_OP_RESP after write, got {}", flag);
        }

        Ok(())
    }

    fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
        let w = self.worker;

        w.store(MEM_OP_TYPE, MEM_ALLOC);
        w.store(MEM_OP_LEN, size);

        w.store(FLAG, MEM_OP_REQ);
        w.notify_flag();
        w.wait_flag_change(MEM_OP_REQ);

        let flag = w.load(FLAG);
        if flag != MEM_OP_RESP {
            anyhow::bail!("Expected MEM_OP_RESP after alloc, got {}", flag);
        }

        Ok(w.load(MEM_OP_RESULT) as u32)
    }

    fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
        let w = self.worker;

        w.store(MEM_OP_TYPE, MEM_FREE);
        w.store(MEM_OP_PTR, ptr);
        w.store(MEM_OP_LEN, size);

        w.store(FLAG, MEM_OP_REQ);
        w.notify_flag();
        w.wait_flag_change(MEM_OP_REQ);

        let flag = w.load(FLAG);
        if flag != MEM_OP_RESP {
            anyhow::bail!("Expected MEM_OP_RESP after free, got {}", flag);
        }

        Ok(w.load(MEM_OP_RESULT) as u32)
    }
}

// ---------------------------------------------------------------------------
// TsfnCaller: memory ops via TSFN+postMessage (outside of transform)
// ---------------------------------------------------------------------------

struct TsfnCaller {
    instance_id: u64,
}

impl<'a> runtime::Caller<'a> for TsfnCaller {
    fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
        let len = buf.len() as u32;
        let data = tsfn_call_blocking(|reply| WasmRequest::WorkerOp {
            instance_id: self.instance_id,
            op: WorkerOp::ReadMemory { ptr, len, reply },
        })??;
        buf.copy_from_slice(&data);
        Ok(())
    }

    fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
        tsfn_call_blocking(|reply| WasmRequest::WorkerOp {
            instance_id: self.instance_id,
            op: WorkerOp::WriteMemory {
                ptr,
                data: buf.to_vec(),
                reply,
            },
        })?
    }

    fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
        tsfn_call_blocking(|reply| WasmRequest::WorkerOp {
            instance_id: self.instance_id,
            op: WorkerOp::Alloc { size, reply },
        })?
    }

    fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
        tsfn_call_blocking(|reply| WasmRequest::WorkerOp {
            instance_id: self.instance_id,
            op: WorkerOp::Free { ptr, size, reply },
        })?
    }
}
