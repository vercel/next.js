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

    init_tracing();

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

/// Holds the trace writer's flush guard for the life of the process. Dropping it flushes the
/// buffered trace to disk, so `project_shutdown` takes it rather than letting the process exit
/// with a truncated file.
static TRACE_GUARD: std::sync::Mutex<
    Option<turbopack_trace_utils::trace_writer::TraceWriterGuard>,
> = std::sync::Mutex::new(None);

/// Enable tracing when `TURBOPACK_TRACING` is set, mirroring `turbopack-cli`. Writes a raw trace
/// to `<cwd>/.turbopack/trace.log`, which `turbopack-trace-server` reads.
///
/// The CLI entry point has had this for a long time; the napi addon did not, which left the
/// standalone CLI unprofilable through the normal tooling.
fn init_tracing() {
    use tracing_subscriber::{Registry, layer::SubscriberExt, util::SubscriberInitExt};
    use turbopack_trace_utils::{
        filter_layer::FilterLayer,
        raw_trace::RawTraceLayer,
        trace_writer::TraceWriter,
        tracing_presets::{
            TRACING_OVERVIEW_TARGETS, TRACING_TURBO_TASKS_TARGETS, TRACING_TURBOPACK_TARGETS,
        },
    };

    let Some(mut trace) = std::env::var("TURBOPACK_TRACING")
        .ok()
        .filter(|v| !v.is_empty())
    else {
        return;
    };
    match trace.as_str() {
        "overview" | "1" => trace = TRACING_OVERVIEW_TARGETS.join(","),
        "turbopack" => trace = TRACING_TURBOPACK_TARGETS.join(","),
        "turbo-tasks" => trace = TRACING_TURBO_TASKS_TARGETS.join(","),
        _ => {}
    }

    let internal_dir = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join(".turbopack");
    if let Err(err) = std::fs::create_dir_all(&internal_dir) {
        eprintln!(
            "turbopack: unable to create {}: {err}",
            internal_dir.display()
        );
        return;
    }
    let trace_path = internal_dir.join("trace.log");
    let file = match std::fs::File::create(&trace_path) {
        Ok(file) => file,
        Err(err) => {
            eprintln!("turbopack: unable to write {}: {err}", trace_path.display());
            return;
        }
    };
    eprintln!("turbopack: tracing to {}", trace_path.display());

    let (trace_writer, guard) = TraceWriter::new(file);
    *TRACE_GUARD.lock().unwrap() = Some(guard);

    Registry::default()
        .with(FilterLayer::try_new(&trace).unwrap())
        .with(RawTraceLayer::new(trace_writer))
        .init();
}

/// Flush the trace file, if tracing is on.
pub fn flush_tracing() {
    drop(TRACE_GUARD.lock().unwrap().take());
}
