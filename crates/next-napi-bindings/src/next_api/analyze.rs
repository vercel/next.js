use std::{iter::once, sync::Arc};

use anyhow::Result;
use next_api::{
    analyze::{
        AnalyzeDataOutputAsset, ModulesDataOutputAsset, combine_output_assets, combine_traced_files,
    },
    project::ProjectContainer,
    route::EndpointGroupKey,
};
use turbo_tasks::{Effects, ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    issue::PlainIssue,
    output::{OutputAsset, OutputAssets},
};

use crate::next_api::utils::strongly_consistent_catch_collectables;

#[turbo_tasks::value(serialization = "skip")]
pub struct WriteAnalyzeResult {
    pub issues: Arc<Vec<ReadRef<PlainIssue>>>,
    pub effects: Arc<Effects>,
}

#[turbo_tasks::function(operation, root)]
pub async fn write_analyze_data_with_issues_operation(
    project: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<WriteAnalyzeResult>> {
    let analyze_data_op = write_analyze_data_with_issues_operation_inner(project, app_dir_only);
    let filter = project.project().issue_filter().await?;

    let (_analyze_data, issues, effects) =
        strongly_consistent_catch_collectables(analyze_data_op, &filter).await?;

    Ok(WriteAnalyzeResult { issues, effects }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn write_analyze_data_with_issues_operation_inner(
    project: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<()> {
    let analyze_data_op = get_analyze_data_operation(project, app_dir_only);

    project
        .project()
        .emit_all_output_assets(analyze_data_op)
        .as_side_effect()
        .await?;

    Ok(())
}

#[turbo_tasks::function(operation)]
async fn get_analyze_data_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<OutputAssets>> {
    let project = container.project();
    let project = project.with_next_config(project.next_config().with_analyze_config());

    let analyze_output_root = project
        .node_root()
        .owned()
        .await?
        .join("diagnostics/analyze/data")?;
    let whole_app_module_graphs = project.whole_app_module_graphs();
    let analyze_output_root = &analyze_output_root;
    let endpoint_groups = project.get_all_endpoint_groups(app_dir_only).await?;

    // Collect output assets from _app and _document to merge into each route's
    // analyze.data so their modules are visible in every route's treemap.
    let mut combined_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = vec![];
    let mut combined_traced_files: Vec<FileSystemPath> = vec![];
    for (key, endpoint_group) in endpoint_groups.iter() {
        if matches!(
            key,
            EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
        ) {
            combined_output_assets.extend(endpoint_group.output_assets().await?.iter().copied());
            combined_traced_files.extend(endpoint_group.traced_files().await?.iter().cloned());
        }
    }

    let has_combined = !combined_output_assets.is_empty();
    let combined_assets_vc = Vc::cell(combined_output_assets);
    let combined_traced_vc = Vc::cell(combined_traced_files);

    let analyze_data = endpoint_groups
        .iter()
        .map(async |(key, endpoint_group)| {
            let output_assets = if has_combined
                && !matches!(
                    key,
                    EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
                ) {
                // Combine route output assets with _app and _document output assets so
                // the generated analyze.data already includes their modules.
                combine_output_assets(endpoint_group.output_assets(), combined_assets_vc)
            } else {
                endpoint_group.output_assets()
            };
            let traced_files = if has_combined
                && !matches!(
                    key,
                    EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
                ) {
                // Combine route traced files with _app and _document traced modules so
                // the generated analyze.data already includes their modules.
                combine_traced_files(endpoint_group.traced_files(), combined_traced_vc)
            } else {
                endpoint_group.traced_files()
            };
            let analyze_data = AnalyzeDataOutputAsset::new(
                analyze_output_root
                    .join(&key.to_string())?
                    .join("analyze.data")?,
                output_assets,
                traced_files,
            )
            .to_resolved()
            .await?;

            Ok(ResolvedVc::upcast(analyze_data))
        })
        .try_join()
        .await?;

    let modules_data = ResolvedVc::upcast(
        ModulesDataOutputAsset::new(
            analyze_output_root.join("modules.data")?,
            *whole_app_module_graphs.await?.full,
        )
        .to_resolved()
        .await?,
    );

    Ok(Vc::cell(
        analyze_data
            .iter()
            .cloned()
            .chain(once(modules_data))
            .collect(),
    ))
}
