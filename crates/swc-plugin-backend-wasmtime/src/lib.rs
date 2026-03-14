use std::path::Path;

use once_cell::sync::Lazy;
use swc_plugin_runner::runtime;

/// Identifier for bytecode cache stored in local filesystem.
///
/// This MUST be updated when bumping wasmtime.
const MODULE_SERIALIZATION_IDENTIFIER: &str = concat!("wasmtime", "-", "v1");

/// A shared wasmtime engine instance.
/// Wasmtime's Engine is already thread-safe (internally Arc'd), so no Mutex needed.
static ENGINE: Lazy<wasmtime::Engine> = Lazy::new(|| {
    let mut config = wasmtime::Config::new();
    config.cranelift_opt_level(wasmtime::OptLevel::Speed);
    // Disable debug info for smaller binary size
    config.debug_info(false);
    wasmtime::Engine::new(&config).expect("Failed to create wasmtime engine")
});

/// Data stored in the wasmtime Store, accessible from host function callbacks.
struct StoreState {
    /// Handles to exported functions/memory, set after instantiation.
    table: WasmtimeTable,
    /// WASI context, if the module imports wasi_snapshot_preview1.
    wasi_ctx: Option<wasmtime_wasi::preview1::WasiP1Ctx>,
}

#[derive(Default)]
struct WasmtimeTable {
    memory: Option<wasmtime::Memory>,
    alloc_func: Option<wasmtime::TypedFunc<u32, u32>>,
    free_func: Option<wasmtime::TypedFunc<(u32, u32), u32>>,
}

struct WasmtimeCache {
    module: wasmtime::Module,
}

// WasmtimeInstance needs to wrap Store in a way that satisfies Send + Sync.
// Store itself is Send but not Sync, so we use an UnsafeCell wrapper.
struct WasmtimeInstance {
    // Store is !Sync, but we ensure single-threaded access via &mut self methods
    store: std::cell::UnsafeCell<wasmtime::Store<StoreState>>,
    module: wasmtime::Module,

    memory: wasmtime::Memory,
    alloc_func: wasmtime::TypedFunc<u32, u32>,
    free_func: wasmtime::TypedFunc<(u32, u32), u32>,
    transform_func: wasmtime::TypedFunc<(u32, u32, u32, u32), u32>,
}

// SAFETY: WasmtimeInstance is Sync because all access to store goes through &mut self,
// ensuring single-threaded access. The swc_plugin_runner framework enforces this.
unsafe impl Sync for WasmtimeInstance {}

struct WasmtimeCaller<'a> {
    memory: wasmtime::Memory,
    alloc_func: &'a wasmtime::TypedFunc<u32, u32>,
    free_func: &'a wasmtime::TypedFunc<(u32, u32), u32>,
    store: &'a mut wasmtime::Store<StoreState>,
}

/// The wasmtime-based SWC plugin runtime.
///
/// This implements the `swc_plugin_runner::runtime::Runtime` trait,
/// allowing it to be used as a drop-in replacement for `WasmerRuntime`.
#[derive(Clone, Copy, Debug)]
pub struct WasmtimeRuntime;

impl runtime::Runtime for WasmtimeRuntime {
    fn identifier(&self) -> &'static str {
        MODULE_SERIALIZATION_IDENTIFIER
    }

    fn prepare_module(&self, bytes: &[u8]) -> anyhow::Result<runtime::ModuleCache> {
        let module = wasmtime::Module::new(&ENGINE, bytes)?;
        Ok(runtime::ModuleCache(Box::new(WasmtimeCache { module })))
    }

    fn init(
        &self,
        _name: &str,
        imports: Vec<(String, runtime::Func)>,
        envs: Vec<(String, String)>,
        module: runtime::Module,
    ) -> anyhow::Result<Box<dyn runtime::Instance>> {
        let module = match module {
            runtime::Module::Cache(cache) => {
                let cache = cache.0.downcast::<WasmtimeCache>().unwrap();
                cache.module
            }
            runtime::Module::Bytes(buf) => wasmtime::Module::new(&ENGINE, &buf)?,
        };

        // Check if this module uses WASI
        let is_wasi = module
            .imports()
            .any(|i| i.module() == "wasi_snapshot_preview1");

        let mut store = if is_wasi {
            let mut wasi_builder = wasmtime_wasi::WasiCtxBuilder::new();

            // Add environment variables
            for (k, v) in &envs {
                wasi_builder.env(k, v);
            }

            // Implicitly enable filesystem access for the wasi plugin to cwd.
            // This matches wasmer behavior: map /cwd to the current working directory.
            if let Ok(cwd) = std::env::current_dir() {
                let dir = wasmtime_wasi::DirPerms::all();
                let file = wasmtime_wasi::FilePerms::all();
                wasi_builder.preopened_dir(&cwd, "/cwd", dir, file)?;
            }

            let wasi_ctx = wasi_builder.build_p1();
            wasmtime::Store::new(
                &ENGINE,
                StoreState {
                    table: WasmtimeTable::default(),
                    wasi_ctx: Some(wasi_ctx),
                },
            )
        } else {
            wasmtime::Store::new(
                &ENGINE,
                StoreState {
                    table: WasmtimeTable::default(),
                    wasi_ctx: None,
                },
            )
        };

        let mut linker = wasmtime::Linker::new(&ENGINE);

        // Register WASI imports if needed
        if is_wasi {
            wasmtime_wasi::preview1::add_to_linker_sync(&mut linker, |state: &mut StoreState| {
                state.wasi_ctx.as_mut().unwrap()
            })?;
        }

        // Register host functions (imports) under the "env" module
        for (fn_name, func) in imports {
            register_host_func(&mut linker, &fn_name, func)?;
        }

        let instance = linker.instantiate(&mut store, &module)?;

        // Get memory export
        let memory = instance
            .get_memory(&mut store, "memory")
            .ok_or_else(|| anyhow::anyhow!("missing memory export"))?;

        // Get exported functions
        let alloc_func = instance.get_typed_func::<u32, u32>(&mut store, "__alloc")?;
        let free_func = instance.get_typed_func::<(u32, u32), u32>(&mut store, "__free")?;
        let transform_func = instance.get_typed_func::<(u32, u32, u32, u32), u32>(
            &mut store,
            "__transform_plugin_process_impl",
        )?;

        // Store handles in the table for host function callbacks
        // Clone the TypedFunc values since they need to be used in multiple places
        store.data_mut().table.memory = Some(memory);
        store.data_mut().table.alloc_func = Some(alloc_func.clone());
        store.data_mut().table.free_func = Some(free_func.clone());

        // Handshake: call diagnostics function to verify plugin initialization
        instance
            .get_typed_func::<(), u32>(&mut store, "__get_transform_plugin_core_pkg_diag")?
            .call(&mut store, ())?;

        Ok(Box::new(WasmtimeInstance {
            store: std::cell::UnsafeCell::new(store),
            module,
            memory,
            alloc_func,
            free_func,
            transform_func,
        }))
    }

    fn clone_cache(&self, cache: &runtime::ModuleCache) -> Option<runtime::ModuleCache> {
        let cache = cache.0.downcast_ref::<WasmtimeCache>()?;
        // wasmtime::Module is internally reference-counted, so clone is cheap
        Some(runtime::ModuleCache(Box::new(WasmtimeCache {
            module: cache.module.clone(),
        })))
    }

    unsafe fn load_cache(&self, path: &Path) -> Option<runtime::ModuleCache> {
        let module = unsafe { wasmtime::Module::deserialize_file(&ENGINE, path) };
        match module {
            Ok(module) => Some(runtime::ModuleCache(Box::new(WasmtimeCache { module }))),
            Err(_) => {
                // If deserialization fails, the cache file is likely corrupt or
                // from an incompatible version. Delete it.
                let _ = std::fs::remove_file(path);
                None
            }
        }
    }

    fn store_cache(&self, path: &Path, cache: &runtime::ModuleCache) -> anyhow::Result<()> {
        let cache = cache.0.downcast_ref::<WasmtimeCache>().unwrap();
        let bytes = cache.module.serialize()?;
        std::fs::write(path, bytes)?;
        Ok(())
    }
}

impl runtime::Instance for WasmtimeInstance {
    fn transform(
        &mut self,
        program_ptr: u32,
        program_len: u32,
        unresolved_mark: u32,
        should_enable_comments_proxy: u32,
    ) -> anyhow::Result<u32> {
        // SAFETY: We have &mut self, ensuring exclusive access to the store
        let store = unsafe { &mut *self.store.get() };
        self.transform_func
            .call(
                store,
                (
                    program_ptr,
                    program_len,
                    unresolved_mark,
                    should_enable_comments_proxy,
                ),
            )
            .map_err(Into::into)
    }

    fn caller(&mut self) -> anyhow::Result<Box<dyn runtime::Caller<'_> + '_>> {
        // SAFETY: We have &mut self, ensuring exclusive access to the store
        let store = unsafe { &mut *self.store.get() };
        Ok(Box::new(WasmtimeCaller {
            memory: self.memory,
            alloc_func: &self.alloc_func,
            free_func: &self.free_func,
            store,
        }))
    }

    fn cache(&self) -> Option<runtime::ModuleCache> {
        Some(runtime::ModuleCache(Box::new(WasmtimeCache {
            module: self.module.clone(),
        })))
    }
}

impl<'a> runtime::Caller<'a> for WasmtimeCaller<'a> {
    fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
        let data = self.memory.data(&self.store);
        let start = ptr as usize;
        let end = start + buf.len();
        if end > data.len() {
            anyhow::bail!("read out of bounds: {}..{} > {}", start, end, data.len());
        }
        buf.copy_from_slice(&data[start..end]);
        Ok(())
    }

    fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
        let data = self.memory.data_mut(&mut self.store);
        let start = ptr as usize;
        let end = start + buf.len();
        if end > data.len() {
            anyhow::bail!("write out of bounds: {}..{} > {}", start, end, data.len());
        }
        data[start..end].copy_from_slice(buf);
        Ok(())
    }

    fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
        self.alloc_func
            .call(&mut self.store, size)
            .map_err(Into::into)
    }

    fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
        self.free_func
            .call(&mut self.store, (ptr, size))
            .map_err(Into::into)
    }
}

/// Register a single host function with the wasmtime linker under the "env" module.
///
/// This bridges the `runtime::Func` closure interface to wasmtime's host function mechanism.
/// The key challenge is that during a host function callback, we need access to the WASM
/// instance's memory and alloc/free functions (stored in `StoreState::table`) to implement
/// the `Caller` trait that the closure expects.
fn register_host_func(
    linker: &mut wasmtime::Linker<StoreState>,
    name: &str,
    func: runtime::Func,
) -> anyhow::Result<()> {
    let param_count = func.sign.0 as usize;
    let result_count = func.sign.1 as usize;

    let params: Vec<wasmtime::ValType> = vec![wasmtime::ValType::I32; param_count];
    let results: Vec<wasmtime::ValType> = vec![wasmtime::ValType::I32; result_count];
    let func_type = wasmtime::FuncType::new(
        linker.engine(),
        params.iter().cloned(),
        results.iter().cloned(),
    );

    let func_inner = func.func;
    let sign = func.sign;
    linker.func_new(
        "env",
        name,
        func_type,
        move |mut caller, args, results_out| {
            let input: Vec<runtime::Value> = args[..sign.0 as usize]
                .iter()
                .map(|v| v.unwrap_i32())
                .collect();
            let mut output = vec![0i32; sign.1 as usize];

            // Use a raw pointer to work around lifetime constraints.
            // SAFETY: The pointer is only dereferenced within this closure,
            // and we ensure the original caller is not moved or dropped until after all uses.
            let caller_ptr: *mut wasmtime::Caller<StoreState> = &mut caller;

            struct UnsafeCaller {
                caller_ptr: *mut wasmtime::Caller<'static, StoreState>,
            }

            impl<'a> runtime::Caller<'a> for UnsafeCaller {
                fn read_buf(&self, ptr: u32, buf: &mut [u8]) -> anyhow::Result<()> {
                    // SAFETY: caller_ptr is valid for the duration of the outer closure
                    let caller = unsafe { &*self.caller_ptr };
                    let memory = caller.data().table.memory.expect("memory not set");
                    let data = memory.data(caller);
                    let start = ptr as usize;
                    let end = start + buf.len();
                    if end > data.len() {
                        anyhow::bail!("read out of bounds: {}..{} > {}", start, end, data.len());
                    }
                    buf.copy_from_slice(&data[start..end]);
                    Ok(())
                }

                fn write_buf(&mut self, ptr: u32, buf: &[u8]) -> anyhow::Result<()> {
                    // SAFETY: caller_ptr is valid for the duration of the outer closure
                    let caller = unsafe { &mut *self.caller_ptr };
                    let memory = caller.data().table.memory.expect("memory not set");
                    let data = memory.data_mut(caller);
                    let start = ptr as usize;
                    let end = start + buf.len();
                    if end > data.len() {
                        anyhow::bail!("write out of bounds: {}..{} > {}", start, end, data.len());
                    }
                    data[start..end].copy_from_slice(buf);
                    Ok(())
                }

                fn alloc(&mut self, size: u32) -> anyhow::Result<u32> {
                    // SAFETY: caller_ptr is valid for the duration of the outer closure
                    let caller = unsafe { &mut *self.caller_ptr };
                    let alloc_func = caller
                        .data()
                        .table
                        .alloc_func
                        .as_ref()
                        .expect("alloc not set")
                        .clone();
                    alloc_func.call(caller, size).map_err(Into::into)
                }

                fn free(&mut self, ptr: u32, size: u32) -> anyhow::Result<u32> {
                    // SAFETY: caller_ptr is valid for the duration of the outer closure
                    let caller = unsafe { &mut *self.caller_ptr };
                    let free_func = caller
                        .data()
                        .table
                        .free_func
                        .as_ref()
                        .expect("free not set")
                        .clone();
                    free_func.call(caller, (ptr, size)).map_err(Into::into)
                }
            }

            let mut unsafe_caller = UnsafeCaller {
                caller_ptr: unsafe { std::mem::transmute(caller_ptr) },
            };

            (func_inner)(&mut unsafe_caller, &input, &mut output);

            for (i, v) in output.into_iter().enumerate() {
                results_out[i] = wasmtime::Val::I32(v);
            }
            Ok(())
        },
    )?;

    Ok(())
}
