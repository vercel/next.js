#![feature(min_specialization)]

/// Explicit extern crate to use allocator.
extern crate turbo_malloc;

mod nft_json;

use std::{
    collections::BTreeSet,
    env::current_dir,
    fs,
    future::Future,
    path::PathBuf,
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use turbo_tasks::{backend::Backend, NothingVc, TaskId, TurboTasks};
use turbo_tasks_fs::{
    glob::GlobVc, DirectoryEntry, DiskFileSystemVc, FileSystemPathVc, FileSystemVc,
    ReadGlobResultVc,
};
use turbo_tasks_memory::{stats::Stats, viz, MemoryBackend};
use turbopack::{
    ecmascript::target::CompileTarget, emit, rebase::RebasedAssetVc, GraphOptionsVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::{AssetVc, AssetsVc},
    context::AssetContextVc,
    reference::all_assets,
    source_asset::SourceAssetVc,
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
        match entry {
            DirectoryEntry::File(path) => {
                let source = SourceAssetVc::new(*path).into();
                list.push(context.process(source));
            }
            _ => {}
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
async fn input_to_modules<'a>(fs: FileSystemVc, input: Vec<String>) -> Result<AssetsVc> {
    let root = FileSystemPathVc::new(fs, "");
    let context = ModuleAssetContextVc::new(
        root,
        GraphOptionsVc::new(false, true, CompileTarget::Current.into()),
    )
    .into();
    let mut list = Vec::new();
    for input in input.iter() {
        let glob = GlobVc::new(input);
        add_glob_results(context, root.read_glob(glob, false), &mut list).await?;
    }
    Ok(AssetsVc::cell(list))
}

fn process_context(dir: &PathBuf, context_directory: Option<&String>) -> Result<String> {
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

fn make_relative_path(dir: &PathBuf, context: &str, input: &str) -> Result<String> {
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
        .replace("\\", "/"))
}

fn process_input(dir: &PathBuf, context: &String, input: &Vec<String>) -> Result<Vec<String>> {
    input
        .iter()
        .map(|input| make_relative_path(dir, context, &input))
        .collect()
}

#[tokio::main]
async fn main() {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let args = Args::parse();
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
                println!("restored cache {} ms", elapsed.as_millis());
                tt
            },
            |tt, _, duration| async move {
                let mut start = Instant::now();
                if *cache_fully {
                    tt.wait_background_done().await;
                    tt.stop_and_wait().await;
                    let elapsed = start.elapsed();
                    println!("flushed cache {} ms", elapsed.as_millis());
                } else {
                    let background_timeout =
                        std::cmp::max(duration / 5, Duration::from_millis(100));
                    let timed_out = timeout(background_timeout, tt.wait_background_done())
                        .await
                        .is_err();
                    tt.stop_and_wait().await;
                    let elapsed = start.elapsed();
                    if timed_out {
                        println!("flushed cache partially {} ms", elapsed.as_millis());
                    } else {
                        println!("flushed cache completely {} ms", elapsed.as_millis());
                    }
                }
                start = Instant::now();
                drop(tt);
                let elapsed = start.elapsed();
                println!("writing cache {} ms", elapsed.as_millis());
            },
        )
        .await;
        return;
    }

    run(
        &args,
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
                let graph = viz::visualize_stats_tree(tree);
                fs::write("graph.html", viz::wrap_html(&graph)).unwrap();
                println!("graph.html written");
            }
            // Dropping is slow, so just forget it...
            std::mem::forget(tt)
        },
    )
    .await;
}

async fn run<B: Backend + 'static, F: Future<Output = ()>>(
    args: &Args,
    create_tt: impl Fn() -> Arc<TurboTasks<B>>,
    final_finish: impl FnOnce(Arc<TurboTasks<B>>, TaskId, Duration) -> F,
) {
    let &CommonArgs {
        ref input,
        watch,
        ref context_directory,
        ..
    } = args.common();

    let start = Instant::now();
    let finish = |tt: Arc<TurboTasks<B>>, root_task: TaskId| async move {
        if watch {
            tt.wait_done().await;
            println!("done in {} ms", start.elapsed().as_millis());

            loop {
                let (elapsed, count) = tt.wait_next_done().await;
                if elapsed.as_millis() >= 10 {
                    println!("updated {} tasks in {} ms", count, elapsed.as_millis());
                } else {
                    println!("updated {} tasks in {} µs", count, elapsed.as_micros());
                }
            }
        } else {
            tt.wait_done().await;
            let dur = start.elapsed();
            println!("done in {} ms", dur.as_millis());
            final_finish(tt, root_task, dur).await;
            let dur = start.elapsed();
            println!("all done in {} ms", dur.as_millis());
        }
    };

    match args {
        Args::Print { common: _ } => {
            let dir = current_dir().unwrap();
            let context = process_context(&dir, context_directory.as_ref()).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let tt = create_tt();
            let task = tt.spawn_root_task(move || {
                let context = context.clone();
                let input = input.clone();
                Box::pin(async move {
                    let mut result = BTreeSet::new();
                    let fs = create_fs("context directory", &context, watch).await?;
                    let modules = input_to_modules(fs, input).await?;
                    for module in modules.iter() {
                        let set = all_assets(*module);
                        for asset in set.await?.iter() {
                            let path = asset.path().await?;
                            result.insert(path.path.to_string());
                        }
                    }
                    for path in result {
                        println!("{}", path);
                    }
                    Ok(NothingVc::new().into())
                })
            });
            finish(tt, task).await;
        }
        Args::Annotate { common: _ } => {
            let dir = current_dir().unwrap();
            let context = process_context(&dir, context_directory.as_ref()).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let tt = create_tt();
            let task = tt.spawn_root_task(move || {
                let context = context.clone();
                let input = input.clone();
                Box::pin(async move {
                    let fs = create_fs("context directory", &context, watch).await?;
                    for module in input_to_modules(fs, input).await?.iter() {
                        let nft_asset = NftJsonAssetVc::new(*module).into();
                        emit(nft_asset)
                    }
                    Ok(NothingVc::new().into())
                })
            });
            finish(tt, task).await;
        }
        Args::Build {
            ref output_directory,
            common: _,
        } => {
            let dir = current_dir().unwrap();
            let context = process_context(&dir, context_directory.as_ref()).unwrap();
            let output = process_context(&dir, Some(output_directory)).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let tt = create_tt();
            let task = tt.spawn_root_task(move || {
                let context = context.clone();
                let input = input.clone();
                let output = output.clone();
                Box::pin(async move {
                    let fs = create_fs("context directory", &context, watch).await?;
                    let out_fs = create_fs("output directory", &output, watch).await?;
                    let input_dir = FileSystemPathVc::new(fs, "");
                    let output_dir = FileSystemPathVc::new(out_fs, "");
                    for module in input_to_modules(fs, input).await?.iter() {
                        let rebased = RebasedAssetVc::new(*module, input_dir, output_dir).into();
                        emit(rebased);
                    }
                    Ok(NothingVc::new().into())
                })
            });
            finish(tt, task).await;
        }
        Args::Size { common: _ } => todo!(),
    }
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
