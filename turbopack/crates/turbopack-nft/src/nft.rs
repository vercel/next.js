use std::{collections::HashSet, env::current_dir, path::PathBuf};

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TransientInstance, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack::{
    ModuleAssetContext,
    ecmascript::AnalyzeMode,
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
    output::OutputAsset,
    reference::all_assets_from_entries,
    reference_type::ReferenceType,
    traced_asset::TracedAsset,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

pub async fn node_file_trace(
    project_root: RcStr,
    input: RcStr,
    graph: bool,
    show_issues: bool,
    max_depth: Option<usize>,
) -> Result<()> {
    let op = node_file_trace_operation(project_root.clone(), input.clone(), graph, max_depth);
    let result = op.resolve_strongly_consistent().await?;

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
    for a in result.await? {
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
        project_root.clone(),
    ));
    let input_dir = workspace_fs.root().owned().await?;
    let input = input_dir.join(&format!("{input}"))?;

    let source = FileSource::new(input);
    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment::default().resolved_cell(),
    ));
    let module_asset_context = ModuleAssetContext::new(
        Default::default(),
        // This config should be kept in sync with
        // turbopack/crates/turbopack/tests/node-file-trace.rs and
        // turbopack/crates/turbopack/src/lib.rs
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
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_node_native_modules: true,
            enable_node_modules: Some(input_dir),
            custom_conditions: vec![rcstr!("node")],
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

    let asset = TracedAsset::new(module).to_resolved().await?;

    Ok(Vc::cell(if graph {
        to_graph(ResolvedVc::upcast(asset), max_depth.unwrap_or(usize::MAX)).await?
    } else {
        to_list(ResolvedVc::upcast(asset)).await?
    }))
}

async fn to_list(asset: ResolvedVc<Box<dyn OutputAsset>>) -> Result<Vec<RcStr>> {
    let mut assets = all_assets_from_entries(Vc::cell(vec![asset]))
        .await?
        .iter()
        .map(async |a| Ok(a.path().await?.path.clone()))
        .try_join()
        .await?;
    assets.sort();
    assets.dedup();

    Ok(assets)
}

async fn to_graph(asset: ResolvedVc<Box<dyn OutputAsset>>, max_depth: usize) -> Result<Vec<RcStr>> {
    let mut visited = HashSet::new();
    let mut queue = Vec::new();
    queue.push((0, asset));

    let mut result = vec![];
    while let Some((depth, asset)) = queue.pop() {
        let references = asset.references().await?;
        let mut indent = String::new();
        for _ in 0..depth {
            indent.push_str("  ");
        }
        if visited.insert(asset) {
            if depth < max_depth {
                for &asset in references.iter().rev() {
                    queue.push((depth + 1, asset));
                }
            }
            result.push(format!("{}{}", indent, asset.path().to_string().await?).into());
        } else if references.is_empty() {
            result.push(format!("{}{} *", indent, asset.path().to_string().await?).into());
        } else {
            result.push(format!("{}{} *...", indent, asset.path().to_string().await?).into());
        }
    }
    result.push("".into());
    result.push("*    : revisited and no references".into());
    result.push("*... : revisited and references were already printed".into());
    Ok(result)
}
