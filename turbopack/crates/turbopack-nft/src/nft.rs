use std::{env::current_dir, path::PathBuf};

use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{TransientInstance, Vc, turbofmt};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
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

pub async fn node_file_trace(
    project_root: RcStr,
    input: RcStr,
    graph: bool,
    show_issues: bool,
    max_depth: Option<usize>,
) -> Result<()> {
    let op = node_file_trace_operation(project_root.clone(), input.clone(), graph, max_depth);
    let result = op.read_strongly_consistent().await?;

    if show_issues {
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

    println!("FILELIST:");
    for a in &result {
        println!("{a}");
    }

    Ok(())
}

#[turbo_tasks::function(operation)]
async fn node_file_trace_operation(
    project_root: RcStr,
    input: RcStr,
    graph: bool,
    max_depth: Option<usize>,
) -> Result<Vc<Vec<RcStr>>> {
    let workspace_fs: Vc<Box<dyn FileSystem>> = Vc::upcast(DiskFileSystem::new(
        rcstr!("workspace"),
        Vc::cell(project_root.clone()),
    ));
    let input_dir = workspace_fs.root().owned().await?;
    let input = input_dir.join(&format!("{input}"))?;

    let source = FileSource::new(input);
    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment::default().resolved_cell(),
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
            tree_shaking_mode: None,
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
    let module = module_asset_context
        .process(Vc::upcast(source), ReferenceType::Undefined)
        .module();

    Ok(Vc::cell(if graph {
        to_graph(module, max_depth.unwrap_or(usize::MAX)).await?
    } else {
        to_list(module).await?
    }))
}

async fn to_list(asset: Vc<Box<dyn Module>>) -> Result<Vec<RcStr>> {
    let mut assets = vec![];

    let mut visited = FxHashSet::default();
    let mut queue = Vec::new();
    queue.push(asset);

    while let Some(asset) = queue.pop() {
        let references = referenced_modules_and_affecting_sources(asset, false).await?;
        let path = &asset.ident().await?.path;
        if visited.insert(asset) {
            for (_, references) in references.iter().rev() {
                for asset in references.modules.iter() {
                    queue.push(**asset);
                }
            }
        }
        assets.push(path.path.clone());
    }

    assets.sort();
    assets.dedup();

    Ok(assets)
}

async fn to_graph(asset: Vc<Box<dyn Module>>, max_depth: usize) -> Result<Vec<RcStr>> {
    let mut visited = FxHashSet::default();
    let mut queue = Vec::new();
    queue.push((0, asset));

    let mut result = vec![];
    while let Some((depth, asset)) = queue.pop() {
        let references = referenced_modules_and_affecting_sources(asset, false).await?;
        let mut indent = String::new();
        for _ in 0..depth {
            indent.push_str("  ");
        }
        let path = &asset.ident().await?.path;
        if visited.insert(asset) {
            if depth < max_depth {
                for (_, references) in references.iter().rev() {
                    for asset in references.modules.iter() {
                        queue.push((depth + 1, **asset));
                    }
                }
            }
            result.push(turbofmt!("{indent}{}", path.path).await?);
        } else if references.is_empty() {
            result.push(turbofmt!("{indent}{} *", path.path).await?);
        } else {
            result.push(turbofmt!("{indent}{} *...", path.path).await?);
        }
    }
    result.push("".into());
    result.push("*    : revisited and no references".into());
    result.push("*... : revisited and references were already printed".into());
    Ok(result)
}
