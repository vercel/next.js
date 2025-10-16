#![feature(future_join)]
#![feature(min_specialization)]

use std::env::current_dir;

use anyhow::Result;
use clap::Parser;
use tracing_subscriber::{Registry, layer::SubscriberExt, util::SubscriberInitExt};
use turbo_tasks::TurboTasks;
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_malloc::TurboMalloc;
use turbopack_nft::nft::node_file_trace;
use turbopack_trace_utils::{
    exit::ExitHandler,
    filter_layer::FilterLayer,
    raw_trace::RawTraceLayer,
    trace_writer::TraceWriter,
    tracing_presets::{
        TRACING_OVERVIEW_TARGETS, TRACING_TURBO_TASKS_TARGETS, TRACING_TURBOPACK_TARGETS,
    },
};

#[derive(Debug, Parser)]
#[clap(author, version, about, long_about = None)]
pub struct Arguments {
    #[clap(value_parser)]
    pub entry: String,

    #[clap(long)]
    pub graph: bool,

    #[clap(long)]
    pub show_issues: bool,

    #[clap(long)]
    pub depth: Option<usize>,
}

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

fn main() {
    let mut rt = tokio::runtime::Builder::new_multi_thread();
    rt.enable_all().disable_lifo_slot();

    let args = Arguments::parse();
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

        let trace_file = current_dir()?.join("turbopack.log");
        let trace_writer = std::fs::File::create(trace_file).unwrap();
        let (trace_writer, guard) = TraceWriter::new(trace_writer);
        let subscriber = subscriber.with(RawTraceLayer::new(trace_writer));

        exit_handler
            .on_exit(async move { tokio::task::spawn_blocking(|| drop(guard)).await.unwrap() });

        subscriber.init();
    }

    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            dependency_tracking: false,
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ));

    tt.run_once(async move {
        node_file_trace(
            current_dir()?.to_str().unwrap().into(),
            args.entry.into(),
            args.graph,
            args.show_issues,
            args.depth,
        )
        .await?;
        Ok(())
    })
    .await?;

    // Intentionally leak this `Arc`. Otherwise we'll waste time during process exit performing a
    // ton of drop calls.
    std::mem::forget(tt);

    Ok(())
}
