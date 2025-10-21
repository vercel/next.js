use std::sync::Arc;

use anyhow::Result;
use next_api::{analyze::analyze_endpoint, operation::OptionEndpoint, project::ProjectContainer};
use turbo_tasks::{Effects, OperationVc, ReadRef, ResolvedVc, Vc};
use turbo_tasks_fs::FileContent;
use turbopack_core::{diagnostics::PlainDiagnostic, issue::PlainIssue};

use crate::next_api::utils::strongly_consistent_catch_collectables;

#[turbo_tasks::value(serialization = "none")]
pub struct AnalyzeDataWithIssues {
    pub analyze_data: Option<ReadRef<FileContent>>,
    pub issues: Arc<Vec<ReadRef<PlainIssue>>>,
    pub diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    pub effects: Arc<Effects>,
}

#[turbo_tasks::function(operation)]
pub async fn get_analyze_data_with_issues_operation(
    project: ResolvedVc<ProjectContainer>,
) -> Result<Vc<AnalyzeDataWithIssues>> {
    let analyze_data_op = get_analyze_data_operation(project);
    let (analyze_data, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(analyze_data_op).await?;
    Ok(AnalyzeDataWithIssues {
        analyze_data,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
async fn get_analyze_data_operation(
    project: ResolvedVc<ProjectContainer>,
) -> Result<Vc<FileContent>> {
    let _project = project.project();
    todo!();
}

#[turbo_tasks::function(operation)]
pub async fn get_analyze_data_for_endpoint_with_issues_operation(
    endpoint_op: OperationVc<OptionEndpoint>,
) -> Result<Vc<AnalyzeDataWithIssues>> {
    let analyze_data_op = get_analyze_data_for_endpoint_operation(endpoint_op);
    let (analyze_data, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(analyze_data_op).await?;
    Ok(AnalyzeDataWithIssues {
        analyze_data,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
async fn get_analyze_data_for_endpoint_operation(
    endpoint_op: OperationVc<OptionEndpoint>,
) -> Result<Vc<FileContent>> {
    let Some(endpoint) = *endpoint_op.connect().await? else {
        return Ok(FileContent::NotFound.cell());
    };
    Ok(analyze_endpoint(*endpoint))
}
