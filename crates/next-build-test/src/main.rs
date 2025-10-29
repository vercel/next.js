use std::{
    cell::RefCell,
    convert::Infallible,
    str::FromStr,
    time::{Duration, Instant},
};

use next_api::project::{DefineEnv, ProjectOptions};
use next_build_test::{Strategy, main_inner};
use next_core::tracing_presets::{
    TRACING_NEXT_OVERVIEW_TARGETS, TRACING_NEXT_TARGETS, TRACING_NEXT_TURBO_TASKS_TARGETS,
    TRACING_NEXT_TURBOPACK_TARGETS,
};
use tracing_subscriber::{Registry, layer::SubscriberExt, util::SubscriberInitExt};
use turbo_rcstr::rcstr;
use turbo_tasks::TurboTasks;
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_malloc::TurboMalloc;
use turbopack_trace_utils::{
    exit::ExitGuard, filter_layer::FilterLayer, raw_trace::RawTraceLayer, trace_writer::TraceWriter,
};

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

enum Cmd {
    Run,
    Generate,
}
impl FromStr for Cmd {
    type Err = Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "run" => Ok(Cmd::Run),
            "generate" => Ok(Cmd::Generate),
            _ => panic!("invalid command, please use 'run' or 'generate'"),
        }
    }
}

fn main() {
    let cmd = std::env::args()
        .nth(1)
        .map(|s| Cmd::from_str(&s))
        .unwrap_or(Ok(Cmd::Run))
        .unwrap();

    match cmd {
        Cmd::Run => {
            let strategy = std::env::args()
                .nth(2)
                .map(|s| Strategy::from_str(&s))
                .transpose()
                .unwrap()
                .unwrap_or(Strategy::Sequential { randomized: true });

            let mut factor = std::env::args()
                .nth(3)
                .map(|s| s.parse().unwrap())
                .unwrap_or(num_cpus::get());

            let limit = std::env::args()
                .nth(4)
                .map(|s| s.parse().unwrap())
                .unwrap_or(1);

            let files = std::env::args()
                .nth(5)
                .map(|f| f.split(',').map(ToOwned::to_owned).collect());

            if matches!(
                strategy,
                Strategy::Sequential { .. } | Strategy::Development { .. }
            ) {
                factor = 1;
            }

            thread_local! {
                static LAST_SWC_ATOM_GC_TIME: RefCell<Option<Instant>> = const { RefCell::new(None) };
            }
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .on_thread_stop(|| {
                    TurboMalloc::thread_stop();
                    tracing::debug!("threads stopped");
                })
                .on_thread_park(|| {
                    LAST_SWC_ATOM_GC_TIME.with_borrow_mut(|cell| {
                        if cell.is_none_or(|t| t.elapsed() > Duration::from_secs(2)) {
                            swc_core::ecma::atoms::hstr::global_atom_store_gc();
                            *cell = Some(Instant::now());
                        }
                    });
                })
                .build()
                .unwrap()
                .block_on(async {
                    let trace = std::env::var("NEXT_TURBOPACK_TRACING").ok();

                    let _guard = if let Some(mut trace) = trace.filter(|v| !v.is_empty()) {
                        // Trace presets
                        match trace.as_str() {
                            "overview" | "1" => {
                                trace = TRACING_NEXT_OVERVIEW_TARGETS.join(",");
                            }
                            "next" => {
                                trace = TRACING_NEXT_TARGETS.join(",");
                            }
                            "turbopack" => {
                                trace = TRACING_NEXT_TURBOPACK_TARGETS.join(",");
                            }
                            "turbo-tasks" => {
                                trace = TRACING_NEXT_TURBO_TASKS_TARGETS.join(",");
                            }
                            _ => {}
                        }

                        let subscriber = Registry::default();

                        let subscriber = subscriber.with(FilterLayer::try_new(&trace).unwrap());
                        let trace_file = "trace.log";
                        let trace_writer = std::fs::File::create(trace_file).unwrap();
                        let (trace_writer, guard) = TraceWriter::new(trace_writer);
                        let subscriber = subscriber.with(RawTraceLayer::new(trace_writer));

                        let guard = ExitGuard::new(guard).unwrap();

                        subscriber.init();

                        Some(guard)
                    } else {
                        tracing_subscriber::fmt::init();

                        None
                    };

                    let tt = TurboTasks::new(TurboTasksBackend::new(
                        BackendOptions {
                            dependency_tracking: false,
                            storage_mode: None,
                            ..Default::default()
                        },
                        noop_backing_storage(),
                    ));
                    let result = main_inner(&tt, strategy, factor, limit, files).await;
                    let memory = TurboMalloc::memory_usage();
                    tracing::info!("memory usage: {} MiB", memory / 1024 / 1024);
                    let start = Instant::now();
                    drop(tt);
                    tracing::info!("drop {:?}", start.elapsed());
                    result
                })
                .unwrap();
        }
        Cmd::Generate => {
            let project_path = std::env::args().nth(2).unwrap_or(".".to_string());
            let current_dir = std::env::current_dir().unwrap();
            let absolute_dir = current_dir.join(project_path);
            let canonical_path = std::fs::canonicalize(absolute_dir).unwrap();

            let options = ProjectOptions {
                build_id: rcstr!("test"),
                define_env: DefineEnv {
                    client: vec![],
                    edge: vec![],
                    nodejs: vec![],
                },
                dev: true,
                encryption_key: rcstr!("deadbeef"),
                env: vec![],
                next_config: include_str!("../nextConfig.json").into(),
                preview_props: next_api::project::DraftModeOptions {
                    preview_mode_encryption_key: rcstr!("deadbeef"),
                    preview_mode_id: rcstr!("test"),
                    preview_mode_signing_key: rcstr!("deadbeef"),
                },
                project_path: canonical_path.to_string_lossy().into(),
                root_path: rcstr!("/"),
                watch: Default::default(),
                browserslist_query: "last 1 Chrome versions, last 1 Firefox versions, last 1 \
                                     Safari versions, last 1 Edge versions"
                    .into(),
                no_mangling: false,
                current_node_js_version: rcstr!("18.0.0"),
            };

            let json = serde_json::to_string_pretty(&options).unwrap();
            println!("{json}");
        }
    }
}
