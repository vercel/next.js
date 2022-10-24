#![feature(min_specialization)]

mod nft_json;
use std::{
    collections::{BTreeSet, HashMap},
    env::current_dir,
    fs,
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
#[cfg(feature = "cli")]
use clap::Parser;
#[cfg(feature = "node-api")]
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc::channel;
use turbo_tasks::{
    backend::Backend,
    primitives::{OptionStringVc, StringsVc},
    util::FormatDuration,
    NothingVc, TaskId, TransientInstance, TransientValue, TurboTasks, Value,
};
use turbo_tasks_fs::{
    glob::GlobVc, DirectoryEntry, DiskFileSystemVc, FileSystemVc, ReadGlobResultVc,
};
use turbo_tasks_memory::{
    stats::{ReferenceType, Stats},
    viz, MemoryBackend,
};
use turbopack::{
    emit, rebase::RebasedAssetVc, resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc, ModuleAssetContextVc,
};
use turbopack_cli_utils::issue::{ConsoleUi, IssueSeverityCliOption, LogOptions};
use turbopack_core::{
    asset::{Asset, AssetVc, AssetsVc},
    context::AssetContextVc,
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    issue::{IssueSeverity, IssueVc},
    reference::all_assets,
    resolve::options::{ImportMapping, ResolvedMap},
    source_asset::SourceAssetVc,
};

use crate::nft_json::NftJsonAssetVc;

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
#[derive(Debug, Clone)]
pub struct CommonArgs {
    input: Vec<String>,

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
    visualize_graph: bool,

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
    // Print all files that the input files reference
    Print {
        #[cfg_attr(feature = "cli", clap(flatten))]
        #[cfg_attr(feature = "node-api", serde(flatten))]
        common: CommonArgs,
    },

    // Adds a *.nft.json file next to each input file which lists the referenced files
    Annotate {
        #[cfg_attr(feature = "cli", clap(flatten))]
        #[cfg_attr(feature = "node-api", serde(flatten))]
        common: CommonArgs,
    },

    // Copy input files and all referenced files to the output directory
    Build {
        #[cfg_attr(feature = "cli", clap(flatten))]
        #[cfg_attr(feature = "node-api", serde(flatten))]
        common: CommonArgs,

        #[cfg_attr(feature = "cli", clap(short, long, default_value_t = String::from("dist")))]
        #[cfg_attr(feature = "node-api", serde(default = "default_output_directory"))]
        output_directory: String,
    },

    // Print total size of input and referenced files
    Size {
        #[cfg_attr(feature = "cli", clap(flatten))]
        #[cfg_attr(feature = "node-api", serde(flatten))]
        common: CommonArgs,
    },
}

#[cfg(feature = "node-api")]
fn default_output_directory() -> String {
    "dist".to_string()
}

impl Args {
    fn common(&self) -> &CommonArgs {
        match self {
            Args::Print { common, .. }
            | Args::Annotate { common, .. }
            | Args::Build { common, .. }
            | Args::Size { common, .. } => common,
        }
    }
}

async fn create_fs(name: &str, context: &str, watch: bool) -> Result<FileSystemVc> {
    let fs = DiskFileSystemVc::new(name.to_string(), context.to_string());
    if watch {
        fs.await?.start_watching()?;
    } else {
        fs.await?.invalidate();
    }
    Ok(fs.into())
}

async fn add_glob_results(
    context: AssetContextVc,
    result: ReadGlobResultVc,
    list: &mut Vec<AssetVc>,
) -> Result<()> {
    let result = result.await?;
    for entry in result.results.values() {
        if let DirectoryEntry::File(path) = entry {
            let source = SourceAssetVc::new(*path).into();
            list.push(context.process(source));
        }
    }
    for result in result.inner.values() {
        fn recurse<'a>(
            context: AssetContextVc,
            result: ReadGlobResultVc,
            list: &'a mut Vec<AssetVc>,
        ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
            Box::pin(add_glob_results(context, result, list))
        }
        // Boxing for async recursion
        recurse(context, *result, list).await?;
    }
    Ok(())
}

#[turbo_tasks::function]
async fn input_to_modules<'a>(
    fs: FileSystemVc,
    input: Vec<String>,
    process_cwd: Option<String>,
    exact: bool,
) -> Result<AssetsVc> {
    let root = fs.root();
    let env = EnvironmentVc::new(
        Value::new(ExecutionEnvironment::NodeJsLambda(
            NodeJsEnvironment {
                cwd: OptionStringVc::cell(process_cwd),
                ..Default::default()
            }
            .into(),
        )),
        Value::new(EnvironmentIntention::Api),
    );
    let glob_mappings = vec![
        (
            root,
            GlobVc::new("**/*/next/dist/server/next.js"),
            ImportMapping::Ignore.into(),
        ),
        (
            root,
            GlobVc::new("**/*/next/dist/bin/next"),
            ImportMapping::Ignore.into(),
        ),
    ];
    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        env,
        Default::default(),
        ResolveOptionsContext {
            emulate_environment: Some(env),
            resolved_map: Some(
                ResolvedMap {
                    by_glob: glob_mappings,
                }
                .cell(),
            ),
            ..Default::default()
        }
        .cell(),
    )
    .into();
    let mut list = Vec::new();
    for input in input.iter() {
        if exact {
            let source = SourceAssetVc::new(root.join(input)).into();
            list.push(context.process(source));
        } else {
            let glob = GlobVc::new(input);
            add_glob_results(context, root.read_glob(glob, false), &mut list).await?;
        };
    }
    Ok(AssetsVc::cell(list))
}

fn process_context(dir: &Path, context_directory: Option<&String>) -> Result<String> {
    let mut context = PathBuf::from(context_directory.map_or(".", |s| s));
    if !context.is_absolute() {
        context = dir.join(context);
    }
    // context = context.canonicalize().unwrap();
    Ok(context
        .to_str()
        .ok_or_else(|| anyhow!("context directory contains invalid characters"))
        .unwrap()
        .to_string())
}

fn make_relative_path(dir: &Path, context: &str, input: &str) -> Result<String> {
    let mut input = PathBuf::from(input);
    if !input.is_absolute() {
        input = dir.join(input);
    }
    // input = input.canonicalize()?;
    let input = input.strip_prefix(context).with_context(|| {
        anyhow!(
            "{} is not part of the context directory {}",
            input.display(),
            context
        )
    })?;
    Ok(input
        .to_str()
        .ok_or_else(|| anyhow!("input contains invalid characters"))?
        .replace('\\', "/"))
}

fn process_input(dir: &Path, context: &str, input: &[String]) -> Result<Vec<String>> {
    input
        .iter()
        .map(|input| make_relative_path(dir, context, input))
        .collect()
}

pub async fn start(args: Arc<Args>) -> Result<Vec<String>> {
    register();
    let &CommonArgs {
        visualize_graph,
        #[cfg(feature = "persistent_cache")]
            cache: CacheArgs {
            ref cache,
            ref cache_fully,
        },
        ..
    } = args.common();
    #[cfg(feature = "persistent_cache")]
    if let Some(cache) = cache {
        use tokio::time::timeout;
        use turbo_tasks_memory::MemoryBackendWithPersistedGraph;
        use turbo_tasks_rocksdb::RocksDbPersistedGraph;

        run(
            &args,
            || {
                let start = Instant::now();
                let backend = MemoryBackendWithPersistedGraph::new(
                    RocksDbPersistedGraph::new(cache).unwrap(),
                );
                let tt = TurboTasks::new(backend);
                let elapsed = start.elapsed();
                println!("restored cache {}", FormatDuration(elapsed));
                tt
            },
            |tt, _, duration| async move {
                let mut start = Instant::now();
                if *cache_fully {
                    tt.wait_background_done().await;
                    tt.stop_and_wait().await;
                    let elapsed = start.elapsed();
                    println!("flushed cache {}", FormatDuration(elapsed));
                } else {
                    let background_timeout =
                        std::cmp::max(duration / 5, Duration::from_millis(100));
                    let timed_out = timeout(background_timeout, tt.wait_background_done())
                        .await
                        .is_err();
                    tt.stop_and_wait().await;
                    let elapsed = start.elapsed();
                    if timed_out {
                        println!("flushed cache partially {}", FormatDuration(elapsed));
                    } else {
                        println!("flushed cache completely {}", FormatDuration(elapsed));
                    }
                }
                start = Instant::now();
                drop(tt);
                let elapsed = start.elapsed();
                println!("writing cache {}", FormatDuration(elapsed));
            },
        )
        .await;
        return;
    }

    run(
        args.clone(),
        || TurboTasks::new(MemoryBackend::new()),
        |tt, root_task, _| async move {
            if visualize_graph {
                let mut stats = Stats::new();
                let b = tt.backend();
                b.with_all_cached_tasks(|task| {
                    stats.add_id(b, task);
                });
                stats.add_id(b, root_task);
                // stats.merge_resolve();
                let tree = stats.treeify(ReferenceType::Child);
                let graph = viz::graph::visualize_stats_tree(tree, ReferenceType::Child);
                fs::write("graph.html", viz::graph::wrap_html(&graph)).unwrap();
                println!("graph.html written");
            }
            // Dropping is slow, so just forget it...
            std::mem::forget(tt)
        },
    )
    .await
}

async fn run<B: Backend + 'static, F: Future<Output = ()>>(
    args: Arc<Args>,
    create_tt: impl Fn() -> Arc<TurboTasks<B>>,
    final_finish: impl FnOnce(Arc<TurboTasks<B>>, TaskId, Duration) -> F,
) -> Result<Vec<String>> {
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
            if let Err(e) = tt.wait_task_completion(root_task, true).await {
                println!("{}", e);
            }
            let (elapsed, count) = tt.get_or_wait_update_info(Duration::from_millis(100)).await;
            println!(
                "done in {} ({} task execution, {} tasks)",
                FormatDuration(start.elapsed()),
                FormatDuration(elapsed),
                count
            );

            loop {
                let (elapsed, count) = tt.get_or_wait_update_info(Duration::from_millis(100)).await;
                println!("updated {} tasks in {}", count, FormatDuration(elapsed));
            }
        } else {
            let result = tt.wait_task_completion(root_task, true).await;
            let dur = start.elapsed();
            let (elapsed, count) = tt.get_or_wait_update_info(Duration::from_millis(100)).await;
            final_finish(tt, root_task, dur).await;
            let dur2 = start.elapsed();
            println!(
                "done in {} ({} compilation, {} task execution, {} tasks)",
                FormatDuration(dur2),
                FormatDuration(dur),
                FormatDuration(elapsed),
                count
            );
            result
        }
    };
    let has_return_value =
        matches!(&*args, Args::Annotate { .. }) || matches!(&*args, Args::Print { .. });
    let (sender, mut receiver) = channel(1);
    let dir = current_dir().unwrap();
    let tt = create_tt();
    let console_ui = Arc::new(ConsoleUi::new(LogOptions {
        current_dir: dir.clone(),
        show_all,
        log_detail,
        log_level: log_level.map_or_else(|| IssueSeverity::Error, |l| l.0),
    }));
    let task = tt.spawn_root_task(move || {
        let dir = dir.clone();
        let args = args.clone();
        let console_ui = console_ui.clone();
        let sender = sender.clone();
        Box::pin(async move {
            let output = main_operation(TransientValue::new(dir.clone()), args.clone().into());

            let console_ui = (*console_ui).clone().cell();
            console_ui
                .group_and_display_issues(TransientValue::new(output.into()))
                .await?;

            if has_return_value {
                let output_read_ref = output.await?;
                let output_iter = output_read_ref.iter().cloned();
                sender.send(output_iter.collect::<Vec<String>>()).await?;
                drop(sender);
            }
            Ok(NothingVc::new().into())
        })
    });
    finish(tt, task).await?;
    let output = if has_return_value {
        receiver.try_recv()?
    } else {
        Vec::new()
    };
    Ok(output)
}

#[turbo_tasks::function]
async fn main_operation(
    current_dir: TransientValue<PathBuf>,
    args: TransientInstance<Args>,
) -> Result<StringsVc> {
    let dir = current_dir.into_value();
    let args = &*args;
    let &CommonArgs {
        ref input,
        watch,
        exact,
        ref context_directory,
        ref process_cwd,
        ..
    } = args.common();
    let context = process_context(&dir, context_directory.as_ref()).unwrap();
    let process_cwd = process_cwd
        .clone()
        .map(|p| p.trim_start_matches(&context).to_owned());
    match *args {
        Args::Print { common: _ } => {
            let input = process_input(&dir, &context, input).unwrap();
            let mut result = BTreeSet::new();
            let fs = create_fs("context directory", &context, watch).await?;
            let modules = input_to_modules(fs, input, process_cwd, exact).await?;
            for module in modules.iter() {
                let set = all_assets(*module);
                IssueVc::attach_context(module.path(), "gathering list of assets".to_string(), set)
                    .await?;
                for asset in set.await?.iter() {
                    let path = asset.path().await?;
                    result.insert(path.path.to_string());
                }
            }

            return Ok(StringsVc::cell(result.into_iter().collect::<Vec<_>>()));
        }
        Args::Annotate { common: _ } => {
            let input = process_input(&dir, &context, input).unwrap();
            let fs = create_fs("context directory", &context, watch).await?;
            let mut output_nft_assets = Vec::new();
            for module in input_to_modules(fs, input, process_cwd, exact)
                .await?
                .iter()
            {
                let nft_asset = NftJsonAssetVc::new(*module);
                let path = nft_asset.path().await?.path.clone();
                output_nft_assets.push(path);
                emit(nft_asset.into())
            }
            return Ok(StringsVc::cell(output_nft_assets));
        }
        Args::Build {
            ref output_directory,
            common: _,
        } => {
            let output = process_context(&dir, Some(output_directory)).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let fs = create_fs("context directory", &context, watch).await?;
            let out_fs = create_fs("output directory", &output, watch).await?;
            let input_dir = fs.root();
            let output_dir = out_fs.root();
            for module in input_to_modules(fs, input, process_cwd, exact)
                .await?
                .iter()
            {
                let rebased = RebasedAssetVc::new(*module, input_dir, output_dir).into();
                emit(rebased);
            }
        }
        Args::Size { common: _ } => todo!(),
    }
    Ok(StringsVc::cell(Vec::new()))
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack::register();
    turbopack_cli_utils::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
