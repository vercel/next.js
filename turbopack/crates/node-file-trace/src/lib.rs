#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{
    env::current_dir,
    future::Future,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
#[cfg(feature = "cli")]
use clap::Parser;
#[cfg(feature = "node-api")]
use serde::Deserialize;
#[cfg(feature = "node-api")]
use serde::Serialize;
use tokio::sync::mpsc::{channel, Receiver, Sender};
use turbo_tasks::{
    backend::Backend, util::FormatDuration, RcStr, ReadConsistency, TaskId, TransientInstance,
    TransientValue, TurboTasks, UpdateInfo, Vc,
};
use turbopack::module_options::ModuleOptionsContext;
use turbopack_cli_utils::issue::{ConsoleUi, IssueSeverityCliOption, LogOptions};
use turbopack_core::issue::{IssueDescriptionExt, IssueReporter, IssueSeverity};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

#[cfg(feature = "persistent_cache")]
#[cfg_attr(feature = "cli", derive(clap::Args))]
#[cfg_attr(
    feature = "node-api",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[derive(Debug, Clone)]
struct CacheArgs {
    #[clap(long)]
    cache: Option<String>,

    #[clap(long)]
    cache_fully: bool,
}

#[cfg(not(feature = "persistent_cache"))]
#[cfg_attr(feature = "cli", derive(clap::Args))]
#[cfg_attr(
    feature = "node-api",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[derive(Debug, Clone, Default)]
pub struct CacheArgs {}

#[cfg_attr(feature = "cli", derive(clap::Args))]
#[cfg_attr(
    feature = "node-api",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[derive(Debug, Clone, Default)]
pub struct CommonArgs {
    /// A list of input files to perform a trace on
    input: Vec<String>,

    /// The folder to consider as the root when performing the trace. All traced files must reside
    /// in this directory
    #[cfg_attr(feature = "cli", clap(short, long))]
    #[cfg_attr(feature = "node-api", serde(default))]
    context_directory: Option<String>,

    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "node-api", serde(default))]
    process_cwd: Option<String>,

    #[cfg_attr(feature = "cli", clap(flatten))]
    #[cfg_attr(feature = "node-api", serde(default))]
    cache: CacheArgs,

    #[cfg_attr(feature = "cli", clap(short, long))]
    #[cfg_attr(feature = "node-api", serde(default))]
    watch: bool,

    #[cfg_attr(feature = "cli", clap(short, long))]
    #[cfg_attr(feature = "node-api", serde(default))]
    /// Filter by issue severity.
    log_level: Option<IssueSeverityCliOption>,

    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "node-api", serde(default))]
    /// Show all log messages without limit.
    show_all: bool,

    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "node-api", serde(default))]
    /// Expand the log details.
    log_detail: bool,

    /// Whether to skip the glob logic
    /// assume the provided input is not glob even if it contains `*` and `[]`
    #[cfg_attr(feature = "cli", clap(short, long))]
    #[cfg_attr(feature = "node-api", serde(default))]
    exact: bool,

    /// Enable experimental garbage collection with the provided memory limit in
    /// MB.
    #[cfg_attr(feature = "cli", clap(long))]
    #[cfg_attr(feature = "serializable", serde(default))]
    memory_limit: Option<usize>,
}

impl CommonArgs {
    pub fn memory_limit(&self) -> usize {
        self.memory_limit.unwrap_or(usize::MAX)
    }
}

#[cfg_attr(feature = "cli", derive(Parser))]
#[cfg_attr(feature = "cli", clap(author, version, about, long_about = None))]
#[cfg_attr(
    feature = "node-api",
    derive(Serialize, Deserialize),
    serde(tag = "action", rename_all = "camelCase")
)]
#[derive(Debug)]
pub enum Args {
    /// Print all files that the input files reference
    Print {
        #[cfg_attr(feature = "cli", clap(flatten))]
        #[cfg_attr(feature = "node-api", serde(flatten))]
        common: CommonArgs,
    },

    /// Adds a *.nft.json file next to each input file which lists the referenced files
    Annotate {
        #[cfg_attr(feature = "cli", clap(flatten))]
        #[cfg_attr(feature = "node-api", serde(flatten))]
        common: CommonArgs,
    },

    /// Copy input files and all referenced files to the output directory
    Build {
        #[cfg_attr(feature = "cli", clap(flatten))]
        #[cfg_attr(feature = "node-api", serde(flatten))]
        common: CommonArgs,

        #[cfg_attr(feature = "cli", clap(short, long, default_value_t = String::from("dist")))]
        #[cfg_attr(feature = "node-api", serde(default = "default_output_directory"))]
        output_directory: String,
    },
}

#[cfg(feature = "node-api")]
fn default_output_directory() -> String {
    "dist".to_string()
}

type OutputPair<T> = Option<(Sender<T>, Receiver<T>)>;

impl Args {
    pub fn common(&self) -> &CommonArgs {
        match self {
            Args::Print { common, .. }
            | Args::Annotate { common, .. }
            | Args::Build { common, .. } => common,
        }
    }

    fn output_pair(&self) -> OutputPair<Vec<RcStr>> {
        match self {
            Args::Print { .. } | Args::Annotate { .. } => Some(channel(1)),
            _ => None,
        }
    }
}

pub async fn start<B: Backend>(
    args: Arc<Args>,
    turbo_tasks: Arc<TurboTasks<B>>,
    module_options: Option<ModuleOptionsContext>,
    resolve_options: Option<ResolveOptionsContext>,
) -> Result<Vec<RcStr>> {
    register();
    run(
        args,
        turbo_tasks,
        |_, _, _| async move {},
        module_options,
        resolve_options,
    )
    .await
}

async fn run<B: Backend + 'static, F: Future<Output = ()>>(
    args: Arc<Args>,
    tt: Arc<TurboTasks<B>>,
    final_finish: impl FnOnce(Arc<TurboTasks<B>>, TaskId, Duration) -> F,
    module_options: Option<ModuleOptionsContext>,
    resolve_options: Option<ResolveOptionsContext>,
) -> Result<Vec<RcStr>> {
    let &CommonArgs {
        watch,
        show_all,
        log_detail,
        log_level,
        ..
    } = args.common();

    let start = Instant::now();
    let finish = |tt: Arc<TurboTasks<B>>, root_task: TaskId| async move {
        if watch {
            if let Err(e) = tt
                .wait_task_completion(root_task, ReadConsistency::Strong)
                .await
            {
                println!("{}", e);
            }
            let UpdateInfo {
                duration, tasks, ..
            } = tt
                .get_or_wait_aggregated_update_info(Duration::from_millis(100))
                .await;
            println!(
                "done in {} ({} task execution, {} tasks)",
                FormatDuration(start.elapsed()),
                FormatDuration(duration),
                tasks
            );

            loop {
                let UpdateInfo {
                    duration, tasks, ..
                } = tt
                    .get_or_wait_aggregated_update_info(Duration::from_millis(100))
                    .await;
                println!("updated {} tasks in {}", tasks, FormatDuration(duration));
            }
        } else {
            let result = tt
                .wait_task_completion(root_task, ReadConsistency::Strong)
                .await;
            let dur = start.elapsed();
            let UpdateInfo {
                duration, tasks, ..
            } = tt
                .get_or_wait_aggregated_update_info(Duration::from_millis(100))
                .await;
            final_finish(tt, root_task, dur).await;
            let dur2 = start.elapsed();
            println!(
                "done in {} ({} compilation, {} task execution, {} tasks)",
                FormatDuration(dur2),
                FormatDuration(dur),
                FormatDuration(duration),
                tasks
            );
            result
        }
    };

    let dir = current_dir().unwrap();
    let module_options = TransientInstance::new(module_options.unwrap_or_default());
    let resolve_options = TransientInstance::new(resolve_options.unwrap_or_default());
    let log_options = TransientInstance::new(LogOptions {
        current_dir: dir.clone(),
        project_dir: dir.clone(),
        show_all,
        log_detail,
        log_level: log_level.map_or_else(|| IssueSeverity::Error, |l| l.0),
    });

    let (sender, receiver) = args.output_pair().unzip();

    let task = tt.spawn_root_task(move || {
        let dir = dir.clone();
        let args = args.clone();
        let sender = sender.clone();
        let module_options = module_options.clone();
        let resolve_options = resolve_options.clone();
        let log_options = log_options.clone();
        Box::pin(async move {
            let common = args.common();
            let output = turbopack::trace::run_node_file_trace(
                TransientValue::new(dir.clone()),
                TransientValue::new(match args.as_ref() {
                    Args::Print { .. } => turbopack::trace::Operation::Print,
                    Args::Annotate { .. } => turbopack::trace::Operation::Annotate,
                    Args::Build {
                        output_directory, ..
                    } => turbopack::trace::Operation::Build(output_directory.clone()),
                }),
                TransientInstance::new(Arc::new(turbopack::trace::Args {
                    context_directory: common.context_directory.clone(),
                    input: common.input.clone(),
                    exact: common.exact,
                    process_cwd: common.process_cwd.clone(),
                    watch: common.watch,
                })),
                module_options,
                resolve_options,
            );
            let _ = output.resolve_strongly_consistent().await?;

            let source = TransientValue::new(Vc::into_raw(output));
            let issues = output.peek_issues_with_path().await?;

            let console_ui = ConsoleUi::new(log_options);
            Vc::upcast::<Box<dyn IssueReporter>>(console_ui)
                .report_issues(
                    TransientInstance::new(issues),
                    source,
                    IssueSeverity::Error.cell(),
                )
                .await?;

            if let Some(sender) = sender {
                let output_read_ref = output.await?;
                let output_iter = output_read_ref.iter().cloned();
                sender.send(output_iter.collect::<Vec<RcStr>>()).await?;
                drop(sender);
            }

            Ok::<Vc<()>, _>(Default::default())
        })
    });

    finish(tt, task).await?;
    receiver
        .map(|mut r| Ok(r.try_recv()?))
        .unwrap_or(Ok(Vec::new()))
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack::register();
    turbopack_cli_utils::register();
    turbopack_resolve::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
