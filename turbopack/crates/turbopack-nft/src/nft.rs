use std::{collections::HashSet, env::current_dir, path::PathBuf};

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TransientInstance, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack::{
    ModuleAssetContext,
    module_options::{CssOptionsContext, EcmascriptOptionsContext, ModuleOptionsContext},
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
) -> Result<()> {
    let op = node_file_trace_operation(project_root.clone(), input.clone(), graph);
    op.resolve_strongly_consistent().await?;

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

    Ok(())
}

#[turbo_tasks::function(operation)]
async fn node_file_trace_operation(project_root: RcStr, input: RcStr, graph: bool) -> Result<()> {
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
        // TODO These test cases should move into the `node-file-trace` crate and use the same
        // config.
        // It's easy to make a mistake here as this should match the config in the binary from
        // turbopack/crates/turbopack/src/lib.rs
        CompileTimeInfo::new(environment),
        ModuleOptionsContext {
            ecmascript: EcmascriptOptionsContext {
                ..Default::default()
            },
            css: CssOptionsContext {
                enable_raw_css: true,
                ..Default::default()
            },
            // Environment is not passed in order to avoid downleveling JS / CSS for
            // node-file-trace.
            environment: None,
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_node_native_modules: true,
            enable_node_modules: Some(input_dir.clone()),
            custom_conditions: vec![rcstr!("node")],
            loose_errors: true,
            ..Default::default()
        }
        .cell(),
        Layer::new(rcstr!("test")),
    );
    let module = module_asset_context
        .process(Vc::upcast(source), ReferenceType::Undefined)
        .module();

    let asset = TracedAsset::new(module).to_resolved().await?;

    if graph {
        print_graph(ResolvedVc::upcast(asset)).await?;
    } else {
        println!("FILELIST:");
        print_list(ResolvedVc::upcast(asset)).await?;
    }

    Ok(())
}

async fn print_list(asset: ResolvedVc<Box<dyn OutputAsset>>) -> Result<()> {
    let mut assets = all_assets_from_entries(Vc::cell(vec![asset]))
        .await?
        .iter()
        .map(async |a| Ok(a.path().await?.path.clone()))
        .try_join()
        .await?;
    assets.sort();
    assets.dedup();

    for a in assets {
        println!("{a}");
    }

    Ok(())
}

async fn print_graph(asset: ResolvedVc<Box<dyn OutputAsset>>) -> Result<()> {
    let mut visited = HashSet::new();
    let mut queue = Vec::new();
    queue.push((0, asset));
    while let Some((depth, asset)) = queue.pop() {
        let references = asset.references().await?;
        let mut indent = String::new();
        for _ in 0..depth {
            indent.push_str("  ");
        }
        if visited.insert(asset) {
            for &asset in references.iter().rev() {
                queue.push((depth + 1, asset));
            }
            println!("{}{}", indent, asset.path().to_string().await?);
        } else if references.is_empty() {
            println!("{}{} *", indent, asset.path().to_string().await?);
        } else {
            println!("{}{} *...", indent, asset.path().to_string().await?);
        }
    }
    Ok(())
}
