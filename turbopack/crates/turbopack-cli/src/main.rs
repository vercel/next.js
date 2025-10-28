#![feature(future_join)]
#![feature(min_specialization)]

use std::{cell::RefCell, path::Path, thread::available_parallelism, time::Instant};

use anyhow::{Context, Result};
use clap::Parser;
use tracing_subscriber::{Registry, layer::SubscriberExt, util::SubscriberInitExt};
use turbo_tasks_malloc::TurboMalloc;
use turbopack_cli::arguments::Arguments;
use turbopack_trace_utils::{
    exit::ExitHandler,
    filter_layer::FilterLayer,
    raw_trace::RawTraceLayer,
    trace_writer::TraceWriter,
    tracing_presets::{
        TRACING_OVERVIEW_TARGETS, TRACING_TURBO_TASKS_TARGETS, TRACING_TURBOPACK_TARGETS,
    },
};

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

fn main() {
    thread_local! {
        static LAST_SWC_ATOM_GC_TIME: RefCell<Option<Instant>> = const { RefCell::new(None) };
    }

    let mut rt = tokio::runtime::Builder::new_multi_thread();
    rt.enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .on_thread_park(|| {
            LAST_SWC_ATOM_GC_TIME.with_borrow_mut(|cell| {
                use std::time::Duration;

                if cell.is_none_or(|t| t.elapsed() > Duration::from_secs(2)) {
                    swc_core::ecma::atoms::hstr::global_atom_store_gc();
                    *cell = Some(Instant::now());
                }
            });
        });

    let args = Arguments::parse();

    let worker_threads = args
        .worker_threads()
        .map(|v| {
            if v == 0 {
                panic!("--worker-threads=0 is invalid, you must use at least one thread.");
            } else {
                v
            }
        })
        .unwrap_or_else(|| available_parallelism().map(|n| n.get()).unwrap_or(1));

    rt.worker_threads(worker_threads);
    rt.max_blocking_threads(usize::MAX - worker_threads);

    #[cfg(not(codspeed))]
    rt.disable_lifo_slot();

    rt.build().unwrap().block_on(main_inner(args)).unwrap();
}

async fn main_inner(args: Arguments) -> Result<()> {
    let exit_handler = ExitHandler::listen();

    let trace = std::env::var("TURBOPACK_TRACING").ok();
    if let Some(mut trace) = trace.filter(|v| !v.is_empty()) {
        // Trace presets
        match trace.as_str() {
            "overview" | "1" => {
                trace = TRACING_OVERVIEW_TARGETS.join(",");
            }
            "turbopack" => {
                trace = TRACING_TURBOPACK_TARGETS.join(",");
            }
            "turbo-tasks" => {
                trace = TRACING_TURBO_TASKS_TARGETS.join(",");
            }
            _ => {}
        }

        let subscriber = Registry::default();

        let subscriber = subscriber.with(FilterLayer::try_new(&trace).unwrap());

        let internal_dir = args
            .dir()
            .unwrap_or_else(|| Path::new("."))
            .join(".turbopack");
        std::fs::create_dir_all(&internal_dir)
            .context("Unable to create .turbopack directory")
            .unwrap();
        let trace_file = internal_dir.join("trace.log");
        let trace_writer = std::fs::File::create(trace_file).unwrap();
        let (trace_writer, guard) = TraceWriter::new(trace_writer);
        let subscriber = subscriber.with(RawTraceLayer::new(trace_writer));

        exit_handler
            .on_exit(async move { tokio::task::spawn_blocking(|| drop(guard)).await.unwrap() });

        subscriber.init();
    }

    match args {
        Arguments::Build(args) => turbopack_cli::build::build(&args).await,
        Arguments::Dev(args) => turbopack_cli::dev::start_server(&args).await,
    }
}
