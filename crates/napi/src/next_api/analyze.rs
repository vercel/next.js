use std::{iter::once, sync::Arc};

use anyhow::Result;
use next_api::{
    analyze::{AnalyzeDataOutputAsset, ModulesDataOutputAsset},
    project::ProjectContainer,
};
use turbo_tasks::{Effects, ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{diagnostics::PlainDiagnostic, issue::PlainIssue, output::OutputAssets};

use crate::next_api::utils::strongly_consistent_catch_collectables;

#[turbo_tasks::value(serialization = "none")]
pub struct WriteAnalyzeResult {
    pub issues: Arc<Vec<ReadRef<PlainIssue>>>,
    pub diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    pub effects: Arc<Effects>,
}

#[turbo_tasks::function(operation)]
pub async fn write_analyze_data_with_issues_operation(
    project: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<WriteAnalyzeResult>> {
    let analyze_data_op = write_analyze_data_with_issues_operation_inner(project, app_dir_only);

    let (_analyze_data, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(analyze_data_op).await?;

    Ok(WriteAnalyzeResult {
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
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
    let analyze_data = project
        .get_all_endpoint_groups(app_dir_only)
        .await?
        .iter()
        .map(|(key, endpoint_group)| async move {
            let output_assets = endpoint_group.output_assets();
            let analyze_data = AnalyzeDataOutputAsset::new(
                analyze_output_root
                    .join(&key.to_string())?
                    .join("analyze.data")?,
                output_assets,
            )
            .to_resolved()
            .await?;

            Ok(ResolvedVc::upcast(analyze_data))
        })
        .try_join()
        .await?;

    whole_app_module_graphs.as_side_effect().await?;

    let modules_data = ResolvedVc::upcast(
        ModulesDataOutputAsset::new(
            analyze_output_root.join("modules.data")?,
            Vc::cell(vec![whole_app_module_graphs.await?.full]),
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
