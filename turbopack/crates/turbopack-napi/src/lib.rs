//! turbopack-napi — the single `#[napi]` addon for the standalone React-on-Turbopack web
//! toolchain. Thin FFI: it marshals opaque `External<T>` handles (never data structures) and
//! keeps all NAPI-only types (`ProjectInstance`, `RootTask`) out of turbo-tasks functions.

#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod project;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

/// Install a multi-thread tokio runtime (with TurboMalloc thread hooks) as the runtime that
/// napi async functions execute on. Mirrors `crates/next-napi-bindings/src/lib.rs`.
#[napi_derive::module_init]
fn init() {
    use napi::bindgen_prelude::create_custom_tokio_runtime;
    use tokio::runtime::Builder;
    use turbo_tasks::{panic_hooks::handle_panic, parallel::available_parallelism};
    use turbo_tasks_malloc::TurboMalloc;

    let prev_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        handle_panic(info);
        prev_hook(info);
    }));

    let worker_threads = available_parallelism().map(|n| n.get()).unwrap_or(1);

    let rt = Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .on_thread_park(|| {
            TurboMalloc::thread_park();
        })
        .worker_threads(worker_threads)
        .max_blocking_threads(usize::MAX - worker_threads)
        .disable_lifo_slot()
        .build()
        .unwrap();
    create_custom_tokio_runtime(rt);
}
