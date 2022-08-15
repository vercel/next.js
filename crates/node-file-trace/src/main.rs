#![feature(min_specialization)]

/// Explicit extern crate to use allocator.
extern crate turbo_malloc;

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
use clap::Parser;
use turbo_tasks::{
    backend::Backend, primitives::StringsVc, util::FormatDuration, NothingVc, TaskId,
    TransientValue, TurboTasks, Value,
};
use turbo_tasks_fs::{
    glob::GlobVc, DirectoryEntry, DiskFileSystemVc, FileSystemPathVc, FileSystemVc,
    ReadGlobResultVc,
};
use turbo_tasks_memory::{stats::Stats, viz, MemoryBackend};
use turbopack::{emit, rebase::RebasedAssetVc, ModuleAssetContextVc};
use turbopack_cli_utils::issue::issue_to_styled_string;
use turbopack_core::{
    asset::{AssetVc, AssetsVc},
    context::AssetContextVc,
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    issue::IssueVc,
    reference::all_assets,
    source_asset::SourceAssetVc,
    target::CompileTargetVc,
    transition::TransitionsByNameVc,
};

use crate::nft_json::NftJsonAssetVc;

#[cfg(feature = "persistent_cache")]
#[derive(clap::Args, Debug, Clone)]
struct CacheArgs {
    #[clap(long)]
    cache: Option<String>,

    #[clap(long)]
    cache_fully: bool,
}

#[cfg(not(feature = "persistent_cache"))]
#[derive(clap::Args, Debug, Clone)]
struct CacheArgs {}

#[derive(clap::Args, Debug, Clone)]
struct CommonArgs {
    input: Vec<String>,

    #[clap(short, long)]
    context_directory: Option<String>,

    #[clap(flatten)]
    cache: CacheArgs,

    #[clap(short, long)]
    visualize_graph: bool,

    #[clap(short, long)]
    watch: bool,

    /// Whether to skip the glob logic
    /// assume the provided input is not glob even if it contains `*` and `[]`
    #[clap(short, long)]
    exact: bool,
}

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
enum Args {
    // Print all files that the input files reference
    Print {
        #[clap(flatten)]
        common: CommonArgs,
    },

    // Adds a *.nft.json file next to each input file which lists the referenced files
    Annotate {
        #[clap(flatten)]
        common: CommonArgs,
    },

    // Copy input files and all referenced files to the output directory
    Build {
        #[clap(flatten)]
        common: CommonArgs,

        #[clap(short, long, default_value_t = String::from("dist"))]
        output_directory: String,
    },

    // Print total size of input and referenced files
    Size {
        #[clap(flatten)]
        common: CommonArgs,
    },
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
    exact: bool,
) -> Result<AssetsVc> {
    let root = FileSystemPathVc::new(fs, "");
    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        root,
        EnvironmentVc::new(
            Value::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment {
                    typescript_enabled: false,
                    compile_target: CompileTargetVc::current(),
                    node_version: 0,
                }
                .into(),
            )),
            Value::new(EnvironmentIntention::ServerRendering),
        ),
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
    let input = input.strip_prefix(&context).with_context(|| {
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

#[tokio::main]
async fn main() -> Result<()> {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let args = Arc::new(Args::parse());
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
                let tree = stats.treeify();
                let graph = viz::graph::visualize_stats_tree(tree);
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
) -> Result<()> {
    let &CommonArgs { watch, .. } = args.common();

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

    let dir = current_dir().unwrap();
    let tt = create_tt();
    let task = tt.spawn_root_task(move || {
        let dir = dir.clone();
        let args = args.clone();
        Box::pin(async move {
            let output = main_operation(TransientValue::new(dir), TransientValue::new(args));

            // TODO only show max severity
            // TODO sort issues by (context.split("/").count(), context)
            // TODO limit number of issues per category
            // TODO show info when hiding issues based on severity or limit
            let issues = IssueVc::peek_issues_with_path(output).await?;

            for (issue, path) in issues.await?.iter_with_shortest_path() {
                println!("{}\n", &*issue_to_styled_string(issue, path).await?);
            }

            for line in output.await?.iter() {
                println!("{line}");
            }
            Ok(NothingVc::new().into())
        })
    });
    finish(tt, task).await?;
    Ok(())
}

#[turbo_tasks::function]
async fn main_operation(
    current_dir: TransientValue<PathBuf>,
    args: TransientValue<Arc<Args>>,
) -> Result<StringsVc> {
    let dir = current_dir.into_value();
    let args = args.into_value();
    let &CommonArgs {
        ref input,
        watch,
        exact,
        ref context_directory,
        ..
    } = args.common();

    match *args {
        Args::Print { common: _ } => {
            let context = process_context(&dir, context_directory.as_ref()).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let mut result = BTreeSet::new();
            let fs = create_fs("context directory", &context, watch).await?;
            let modules = input_to_modules(fs, input, exact).await?;
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
            let context = process_context(&dir, context_directory.as_ref()).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let fs = create_fs("context directory", &context, watch).await?;
            for module in input_to_modules(fs, input, exact).await?.iter() {
                let nft_asset = NftJsonAssetVc::new(*module).into();
                emit(nft_asset)
            }
        }
        Args::Build {
            ref output_directory,
            common: _,
        } => {
            let context = process_context(&dir, context_directory.as_ref()).unwrap();
            let output = process_context(&dir, Some(output_directory)).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let fs = create_fs("context directory", &context, watch).await?;
            let out_fs = create_fs("output directory", &output, watch).await?;
            let input_dir = FileSystemPathVc::new(fs, "");
            let output_dir = FileSystemPathVc::new(out_fs, "");
            for module in input_to_modules(fs, input, exact).await?.iter() {
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
