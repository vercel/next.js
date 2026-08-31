use std::{env::current_dir, path::PathBuf};

use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    ResolvedVc, TransientInstance, TryJoinIterExt, Vc, trace::TraceRawVcs, turbofmt,
};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath};
use turbopack::{
    ModuleAssetContext,
    module_options::{
        CssOptionsContext, EcmascriptOptionsContext, ModuleOptionsContext,
        TypescriptTransformOptions,
    },
};
use turbopack_cli_utils::issue::{ConsoleUi, LogOptions};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
    issue::{IssueReporter, IssueSeverity, handle_issues},
    module::Module,
    reference::referenced_modules_and_affecting_sources,
    reference_type::ReferenceType,
    resolve::options::ConditionValue,
};
use turbopack_ecmascript::AnalyzeMode;
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

#[derive(TraceRawVcs)]
pub struct NftResult {
    pub files: Vec<RcStr>,
    pub issues: Vec<RcStr>,
}

pub async fn node_file_trace(
    project_root: RcStr,
    cwd: RcStr,
    output_base: RcStr,
    input: Vec<RcStr>,
    graph: bool,
    print_issues: bool,
    max_depth: Option<usize>,
) -> Result<NftResult> {
    let op = node_file_trace_operation(
        project_root.clone(),
        cwd,
        output_base,
        input,
        graph,
        max_depth,
    );
    let result = op.read_strongly_consistent().owned().await?;

    if print_issues {
        let issue_reporter: Vc<Box<dyn IssueReporter>> =
            Vc::upcast(ConsoleUi::new(TransientInstance::new(LogOptions {
                project_dir: PathBuf::from(project_root),
                current_dir: current_dir().unwrap(),
                show_all: true,
                log_detail: false,
                log_level: IssueSeverity::Hint,
            })));

        handle_issues(op, issue_reporter, IssueSeverity::Error, None, None).await?;
    }

    Ok(NftResult {
        files: result,
        issues: vec![], // TODO
    })
}

#[turbo_tasks::function(operation, root)]
async fn node_file_trace_operation(
    project_root: RcStr,
    cwd: RcStr,
    output_base: RcStr,
    input: Vec<RcStr>,
    graph: bool,
    max_depth: Option<usize>,
) -> Result<Vc<Vec<RcStr>>> {
    let workspace_fs: Vc<Box<dyn FileSystem>> = Vc::upcast(DiskFileSystem::new(
        rcstr!("workspace"),
        Vc::cell(project_root.clone()),
    ));
    let input_dir = workspace_fs.root().owned().await?;
    let sources = input
        .iter()
        .map(|i| anyhow::Ok(FileSource::new(input_dir.join(i)?)))
        .collect::<Result<Vec<_>, _>>()?;
    let output_base = input_dir.join(&output_base)?;
    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment {
            cwd: ResolvedVc::cell(Some(input_dir.join(&cwd)?)),
            ..Default::default()
        }
        .resolved_cell(),
    ));
    let module_asset_context = ModuleAssetContext::new_without_replace_externals(
        Default::default(),
        // This config should be kept in sync with
        // turbopack/crates/turbopack-tracing/tests/node-file-trace.rs and
        // turbopack/crates/turbopack-tracing/tests/unit.rs and
        // turbopack/crates/turbopack/src/lib.rs and
        // turbopack/crates/turbopack-nft/src/nft.rs
        CompileTimeInfo::new(environment),
        ModuleOptionsContext {
            ecmascript: EcmascriptOptionsContext {
                enable_typescript_transform: Some(
                    TypescriptTransformOptions::default().resolved_cell(),
                ),
                ..Default::default()
            },
            css: CssOptionsContext {
                enable_raw_css: true,
                ..Default::default()
            },
            // Environment is not passed in order to avoid downleveling JS / CSS for
            // node-file-trace.
            environment: None,
            analyze_mode: AnalyzeMode::Tracing,
            // Disable tree shaking. Even side-effect-free imports need to be traced, as they will
            // execute at runtime.
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_node_native_modules: true,
            enable_node_modules: Some(input_dir),
            custom_conditions: vec![rcstr!("node")],
            module_sync: ConditionValue::Unknown,
            enable_node_externals: true,
            loose_errors: true,
            collect_affecting_sources: true,
            ..Default::default()
        }
        .cell(),
        Layer::new(rcstr!("externals-tracing")),
    );
    let modules = sources
        .into_iter()
        .map(|source| {
            module_asset_context
                .process(Vc::upcast(source), ReferenceType::Undefined)
                .module()
                .to_resolved()
        })
        .try_join()
        .await?;

    Ok(Vc::cell(if graph {
        to_graph(modules, output_base, max_depth.unwrap_or(usize::MAX)).await?
    } else {
        to_list(modules, output_base).await?
    }))
}

async fn to_list(
    entries: Vec<ResolvedVc<Box<dyn Module>>>,
    output_base: FileSystemPath,
) -> Result<Vec<RcStr>> {
    let mut result = vec![];

    let mut visited = FxHashSet::default();
    let mut queue = entries;

    while let Some(module) = queue.pop() {
        let references = referenced_modules_and_affecting_sources(*module, false).await?;
        let Some(path) = output_base.get_relative_path_to(&module.ident().await?.path) else {
            continue;
        };
        let path = path
            .strip_prefix("./")
            .map_or_else(|| path.clone(), RcStr::from);

        if visited.insert(module) {
            for (_, references) in references.iter().rev() {
                for module in references.modules.iter() {
                    queue.push(*module);
                }
            }
        }
        result.push(path);
    }

    result.sort();
    result.dedup();

    Ok(result)
}

async fn to_graph(
    assets: Vec<ResolvedVc<Box<dyn Module>>>,
    output_base: FileSystemPath,
    max_depth: usize,
) -> Result<Vec<RcStr>> {
    let mut visited = FxHashSet::default();
    let mut queue: Vec<_> = assets.into_iter().map(|a| (0, a)).collect();

    let mut result = vec![];
    while let Some((depth, asset)) = queue.pop() {
        let references = referenced_modules_and_affecting_sources(*asset, false).await?;
        let mut indent = String::new();
        for _ in 0..depth {
            indent.push_str("  ");
        }
        let Some(path) = &output_base.get_relative_path_to(&asset.ident().await?.path) else {
            continue;
        };
        let path = path.strip_prefix("./").unwrap_or(path);
        if visited.insert(asset) {
            if depth < max_depth {
                for (_, references) in references.iter().rev() {
                    for asset in references.modules.iter() {
                        queue.push((depth + 1, *asset));
                    }
                }
            }
            result.push(turbofmt!("{indent}{}", path).await?);
        } else if references.is_empty() {
            result.push(turbofmt!("{indent}{} *", path).await?);
        } else {
            result.push(turbofmt!("{indent}{} *...", path).await?);
        }
    }
    result.push("".into());
    result.push("*    : revisited and no references".into());
    result.push("*... : revisited and references were already printed".into());
    Ok(result)
}
