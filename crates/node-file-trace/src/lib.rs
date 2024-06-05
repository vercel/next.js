#![feature(min_specialization)]
#![feature(arbitrary_self_types)]

mod nft_json;

use std::{
    collections::{BTreeSet, HashMap},
    env::current_dir,
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
use serde::Deserialize;
#[cfg(feature = "node-api")]
use serde::Serialize;
use tokio::sync::mpsc::channel;
use turbo_tasks::{
    backend::Backend, util::FormatDuration, RcStr, TaskId, TransientInstance, TransientValue,
    TurboTasks, UpdateInfo, Value, Vc,
};
use turbo_tasks_fs::{
    glob::Glob, DirectoryEntry, DiskFileSystem, FileSystem, FileSystemPath, ReadGlobResult,
};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    emit_asset, emit_with_completion, module_options::ModuleOptionsContext, rebase::RebasedAsset,
    ModuleAssetContext,
};
use turbopack_cli_utils::issue::{ConsoleUi, IssueSeverityCliOption, LogOptions};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    issue::{IssueDescriptionExt, IssueReporter, IssueSeverity},
    module::{Module, Modules},
    output::OutputAsset,
    reference::all_modules_and_affecting_sources,
    resolve::options::{ImportMapping, ResolvedMap},
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::nft_json::NftJsonAsset;

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
    pub memory_limit: Option<usize>,
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

async fn create_fs(name: &str, root: &str, watch: bool) -> Result<Vc<Box<dyn FileSystem>>> {
    let fs = DiskFileSystem::new(name.into(), root.into(), vec![]);
    if watch {
        fs.await?.start_watching()?;
    } else {
        fs.await?.invalidate();
    }
    Ok(Vc::upcast(fs))
}

async fn add_glob_results(
    asset_context: Vc<Box<dyn AssetContext>>,
    result: Vc<ReadGlobResult>,
    list: &mut Vec<Vc<Box<dyn Module>>>,
) -> Result<()> {
    let result = result.await?;
    for entry in result.results.values() {
        if let DirectoryEntry::File(path) = entry {
            let source = Vc::upcast(FileSource::new(*path));
            let module = asset_context
                .process(
                    source,
                    Value::new(turbopack_core::reference_type::ReferenceType::Undefined),
                )
                .module();
            list.push(module);
        }
    }
    for result in result.inner.values() {
        fn recurse<'a>(
            asset_context: Vc<Box<dyn AssetContext>>,
            result: Vc<ReadGlobResult>,
            list: &'a mut Vec<Vc<Box<dyn Module>>>,
        ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
            Box::pin(add_glob_results(asset_context, result, list))
        }
        // Boxing for async recursion
        recurse(asset_context, *result, list).await?;
    }
    Ok(())
}

#[turbo_tasks::function]
async fn input_to_modules(
    fs: Vc<Box<dyn FileSystem>>,
    input: Vec<RcStr>,
    exact: bool,
    process_cwd: Option<RcStr>,
    context_directory: RcStr,
    module_options: TransientInstance<ModuleOptionsContext>,
    resolve_options: TransientInstance<ResolveOptionsContext>,
) -> Result<Vc<Modules>> {
    let root = fs.root();
    let process_cwd = process_cwd
        .clone()
        .map(|p| format!("/ROOT{}", p.trim_start_matches(&*context_directory)).into());

    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(create_module_asset(
        root,
        process_cwd,
        module_options,
        resolve_options,
    ));

    let mut list = Vec::new();
    for input in input {
        if exact {
            let source = Vc::upcast(FileSource::new(root.join(input)));
            let module = asset_context
                .process(
                    source,
                    Value::new(turbopack_core::reference_type::ReferenceType::Undefined),
                )
                .module();
            list.push(module);
        } else {
            let glob = Glob::new(input);
            add_glob_results(asset_context, root.read_glob(glob, false), &mut list).await?;
        };
    }
    Ok(Vc::cell(list))
}

fn process_context(dir: &Path, context_directory: Option<&String>) -> Result<String> {
    let mut context_directory = PathBuf::from(context_directory.map_or(".", |s| s));
    if !context_directory.is_absolute() {
        context_directory = dir.join(context_directory);
    }
    // context = context.canonicalize().unwrap();
    Ok(context_directory
        .to_str()
        .ok_or_else(|| anyhow!("context directory contains invalid characters"))
        .unwrap()
        .to_string())
}

fn make_relative_path(dir: &Path, context_directory: &str, input: &str) -> Result<RcStr> {
    let mut input = PathBuf::from(input);
    if !input.is_absolute() {
        input = dir.join(input);
    }
    // input = input.canonicalize()?;
    let input = input.strip_prefix(context_directory).with_context(|| {
        anyhow!(
            "{} is not part of the context directory {}",
            input.display(),
            context_directory
        )
    })?;
    Ok(input
        .to_str()
        .ok_or_else(|| anyhow!("input contains invalid characters"))?
        .replace('\\', "/")
        .into())
}

fn process_input(dir: &Path, context_directory: &str, input: &[String]) -> Result<Vec<RcStr>> {
    input
        .iter()
        .map(|input| make_relative_path(dir, context_directory, input))
        .collect()
}

pub async fn start(
    args: Arc<Args>,
    turbo_tasks: Option<&Arc<TurboTasks<MemoryBackend>>>,
    module_options: Option<ModuleOptionsContext>,
    resolve_options: Option<ResolveOptionsContext>,
) -> Result<Vec<RcStr>> {
    register();
    let &CommonArgs {
        memory_limit,
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
        || {
            turbo_tasks.cloned().unwrap_or_else(|| {
                TurboTasks::new(MemoryBackend::new(memory_limit.unwrap_or(usize::MAX)))
            })
        },
        |_, _, _| async move {},
        module_options,
        resolve_options,
    )
    .await
}

async fn run<B: Backend + 'static, F: Future<Output = ()>>(
    args: Arc<Args>,
    create_tt: impl Fn() -> Arc<TurboTasks<B>>,
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
            if let Err(e) = tt.wait_task_completion(root_task, true).await {
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
            let result = tt.wait_task_completion(root_task, true).await;
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
    let has_return_value =
        matches!(&*args, Args::Annotate { .. }) || matches!(&*args, Args::Print { .. });
    let (sender, mut receiver) = channel(1);
    let dir = current_dir().unwrap();
    let tt = create_tt();
    let module_options = TransientInstance::new(module_options.unwrap_or_default());
    let resolve_options = TransientInstance::new(resolve_options.unwrap_or_default());
    let log_options = TransientInstance::new(LogOptions {
        current_dir: dir.clone(),
        project_dir: dir.clone(),
        show_all,
        log_detail,
        log_level: log_level.map_or_else(|| IssueSeverity::Error, |l| l.0),
    });
    let task = tt.spawn_root_task(move || {
        let dir = dir.clone();
        let args = args.clone();
        let sender = sender.clone();
        let module_options = module_options.clone();
        let resolve_options = resolve_options.clone();
        let log_options = log_options.clone();
        Box::pin(async move {
            let output = main_operation(
                TransientValue::new(dir.clone()),
                args.clone().into(),
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

            if has_return_value {
                let output_read_ref = output.await?;
                let output_iter = output_read_ref.iter().cloned();
                sender.send(output_iter.collect::<Vec<RcStr>>()).await?;
                drop(sender);
            }
            Ok::<Vc<()>, _>(Default::default())
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
    module_options: TransientInstance<ModuleOptionsContext>,
    resolve_options: TransientInstance<ResolveOptionsContext>,
) -> Result<Vc<Vec<RcStr>>> {
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
    let context_directory: RcStr = process_context(&dir, context_directory.as_ref())
        .unwrap()
        .into();
    let fs = create_fs("context directory", &context_directory, watch).await?;
    let process_cwd = process_cwd.clone().map(RcStr::from);

    match *args {
        Args::Print { common: _ } => {
            let input = process_input(&dir, &context_directory, input).unwrap();
            let mut result = BTreeSet::new();
            let modules = input_to_modules(
                fs,
                input,
                exact,
                process_cwd.clone(),
                context_directory,
                module_options,
                resolve_options,
            )
            .await?;
            for module in modules.iter() {
                let set = all_modules_and_affecting_sources(*module)
                    .issue_file_path(module.ident().path(), "gathering list of assets")
                    .await?;
                for asset in set.await?.iter() {
                    let path = asset.ident().path().await?;
                    result.insert(RcStr::from(&*path.path));
                }
            }

            return Ok(Vc::cell(result.into_iter().collect::<Vec<_>>()));
        }
        Args::Annotate { common: _ } => {
            let input = process_input(&dir, &context_directory, input).unwrap();
            let mut output_nft_assets = Vec::new();
            let mut emits = Vec::new();
            for module in input_to_modules(
                fs,
                input,
                exact,
                process_cwd.clone(),
                context_directory,
                module_options,
                resolve_options,
            )
            .await?
            .iter()
            {
                let nft_asset = NftJsonAsset::new(*module);
                let path = nft_asset.ident().path().await?.path.clone();
                output_nft_assets.push(path);
                emits.push(emit_asset(Vc::upcast(nft_asset)));
            }
            // Wait for all files to be emitted
            for emit in emits {
                emit.await?;
            }
            return Ok(Vc::cell(output_nft_assets));
        }
        Args::Build {
            ref output_directory,
            common: _,
        } => {
            let output = process_context(&dir, Some(output_directory)).unwrap();
            let input = process_input(&dir, &context_directory, input).unwrap();
            let out_fs = create_fs("output directory", &output, watch).await?;
            let input_dir = fs.root();
            let output_dir = out_fs.root();
            let mut emits = Vec::new();
            for module in input_to_modules(
                fs,
                input,
                exact,
                process_cwd.clone(),
                context_directory,
                module_options,
                resolve_options,
            )
            .await?
            .iter()
            {
                let rebased = Vc::upcast(RebasedAsset::new(*module, input_dir, output_dir));
                emits.push(emit_with_completion(rebased, output_dir));
            }
            // Wait for all files to be emitted
            for emit in emits {
                emit.await?;
            }
        }
        Args::Size { common: _ } => todo!(),
    }
    Ok(Vc::cell(Vec::new()))
}

#[turbo_tasks::function]
async fn create_module_asset(
    root: Vc<FileSystemPath>,
    process_cwd: Option<RcStr>,
    module_options: TransientInstance<ModuleOptionsContext>,
    resolve_options: TransientInstance<ResolveOptionsContext>,
) -> Result<Vc<ModuleAssetContext>> {
    let env = Environment::new(Value::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment {
            cwd: Vc::cell(process_cwd),
            ..Default::default()
        }
        .into(),
    )));
    let compile_time_info = CompileTimeInfo::builder(env).cell();
    let glob_mappings = vec![
        (
            root,
            Glob::new("**/*/next/dist/server/next.js".into()),
            ImportMapping::Ignore.into(),
        ),
        (
            root,
            Glob::new("**/*/next/dist/bin/next".into()),
            ImportMapping::Ignore.into(),
        ),
    ];
    let mut resolve_options = ResolveOptionsContext::clone(&*resolve_options);
    if resolve_options.emulate_environment.is_none() {
        resolve_options.emulate_environment = Some(env);
    }
    if resolve_options.resolved_map.is_none() {
        resolve_options.resolved_map = Some(
            ResolvedMap {
                by_glob: glob_mappings,
            }
            .cell(),
        );
    }

    Ok(ModuleAssetContext::new(
        Vc::cell(HashMap::new()),
        compile_time_info,
        ModuleOptionsContext::clone(&*module_options).cell(),
        resolve_options.cell(),
        Vc::cell("node_file_trace".into()),
    ))
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack::register();
    turbopack_cli_utils::register();
    turbopack_resolve::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
