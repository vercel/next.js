use std::{
    collections::BTreeSet,
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
};

use anyhow::{anyhow, Context, Result};
use turbo_tasks::{RcStr, TransientInstance, TransientValue, Value, Vc};
use turbo_tasks_fs::{
    glob::Glob, DirectoryEntry, DiskFileSystem, FileSystem, FileSystemPath, ReadGlobResult,
};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    issue::IssueDescriptionExt,
    module::{Module, Modules},
    output::OutputAsset,
    reference::all_modules_and_affecting_sources,
    resolve::options::{ImportMapping, ResolvedMap},
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{
    emit_asset, emit_with_completion, module_options::ModuleOptionsContext, rebase::RebasedAsset,
    ModuleAssetContext,
};

#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub enum Operation {
    Print,
    Annotate,
    Build(String),
}

pub struct Args {
    /// A list of input files to perform a trace on
    pub input: Vec<String>,

    /// The folder to consider as the root when performing the trace. All traced files must reside
    /// in this directory
    pub context_directory: Option<String>,

    pub process_cwd: Option<String>,

    /// Whether to watch the context directory for changes
    pub watch: bool,

    /// Whether to skip the glob logic
    /// assume the provided input is not glob even if it contains `*` and `[]`
    pub exact: bool,
}

#[turbo_tasks::function]
pub async fn run_node_file_trace(
    current_dir: TransientValue<PathBuf>,
    operation: TransientValue<Operation>,
    args: TransientInstance<Arc<Args>>,
    module_options: TransientInstance<ModuleOptionsContext>,
    resolve_options: TransientInstance<ResolveOptionsContext>,
) -> Result<Vc<Vec<RcStr>>> {
    let dir = current_dir.into_value();
    let &Args {
        ref input,
        watch,
        exact,
        ref context_directory,
        ref process_cwd,
        ..
    } = &**args;
    let context_directory: RcStr = process_context(&dir, context_directory.as_ref())
        .unwrap()
        .into();
    let fs = create_fs("context directory", &context_directory, watch).await?;
    let process_cwd = process_cwd.clone().map(RcStr::from);

    match &*operation {
        Operation::Print => {
            let input = get_inputs(&dir, &context_directory, input).unwrap();

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
        Operation::Annotate => {
            let input = get_inputs(&dir, &context_directory, input).unwrap();

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
                let nft_asset = crate::nft_json::NftJsonAsset::new(*module, None, true, fs, fs);
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
        Operation::Build(output_directory) => {
            let output = process_context(&dir, Some(output_directory)).unwrap();
            let input = get_inputs(&dir, &context_directory, input).unwrap();
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
    }
    Ok(Vc::cell(Vec::new()))
}

async fn create_fs(name: &str, root: &str, watch: bool) -> Result<Vc<DiskFileSystem>> {
    let fs = DiskFileSystem::new(name.into(), root.into(), vec![]);
    if watch {
        fs.await?.start_watching(None).await?;
    } else {
        fs.await?.invalidate_with_reason();
    }
    Ok(fs)
}

fn process_context(dir: &Path, context_directory: Option<&String>) -> Result<String> {
    let mut context_directory = PathBuf::from(context_directory.map(|s| s.as_str()).unwrap_or("."));
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

fn get_inputs(dir: &Path, context_directory: &str, input: &[String]) -> Result<Vec<RcStr>> {
    let input = process_input(dir, context_directory, input);
    let (ok, errs): (Vec<_>, Vec<_>) = input.into_iter().partition(Result::is_ok);
    if !errs.is_empty() {
        return Err(anyhow!("Input files could not be found {:?}", errs));
    }
    let input = ok.into_iter().map(|i| i.unwrap()).collect();
    Ok(input)
}

fn process_input(dir: &Path, context_directory: &str, input: &[String]) -> Vec<Result<RcStr>> {
    input
        .iter()
        .map(|input| make_relative_path(dir, context_directory, input))
        .collect()
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

#[turbo_tasks::function]
async fn input_to_modules(
    fs: Vc<DiskFileSystem>,
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

async fn add_glob_results(
    asset_context: Vc<Box<dyn AssetContext>>,
    result: Vc<ReadGlobResult>,
    list: &mut Vec<Vc<Box<dyn Module>>>,
) -> Result<()> {
    let result = result.await?;
    for entry in result.results.values() {
        if let DirectoryEntry::File(path) = entry {
            let source = Vc::upcast(FileSource::new(**path));
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
        recurse(asset_context, **result, list).await?;
    }
    Ok(())
}

#[turbo_tasks::function]
async fn create_module_asset(
    root: Vc<FileSystemPath>,
    process_cwd: Option<RcStr>,
    module_options: TransientInstance<ModuleOptionsContext>,
    resolve_options: TransientInstance<ResolveOptionsContext>,
) -> Vc<ModuleAssetContext> {
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

    ModuleAssetContext::new(
        Default::default(),
        compile_time_info,
        ModuleOptionsContext::clone(&*module_options).cell(),
        resolve_options.cell(),
        Vc::cell("node_file_trace".into()),
    )
}
