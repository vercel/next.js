use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::RcStr;
use turbo_tasks::{PrettyPrintError, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString,
        resolve::ResolvingIssue,
    },
    reference_type::ReferenceType,
    resolve::{
        ModuleResolveResult, ResolveErrorMode, ResolveResult, options::ResolveOptions,
        parse::Request,
    },
};

pub async fn handle_resolve_error(
    result: Vc<ModuleResolveResult>,
    reference_type: ReferenceType,
    origin_path: FileSystemPath,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    error_mode: ResolveErrorMode,

    source: Option<IssueSource>,
) -> Result<Vc<ModuleResolveResult>> {
    Ok(match result.await {
        Ok(result_ref) => {
            if result_ref.is_unresolvable() {
                emit_unresolvable_issue(
                    error_mode,
                    &origin_path,
                    reference_type,
                    request,
                    resolve_options,
                    source,
                )
                .await?;
            }

            handle_item_issues(result_ref.errors(), &origin_path, source).await?;

            result
        }
        Err(err) => {
            emit_resolve_error_issue(
                error_mode,
                &origin_path,
                reference_type,
                request,
                resolve_options,
                err,
                source,
            )
            .await?;
            *ModuleResolveResult::unresolvable()
        }
    })
}

pub async fn handle_resolve_source_error(
    result: Vc<ResolveResult>,
    reference_type: ReferenceType,
    origin_path: FileSystemPath,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    error_mode: ResolveErrorMode,
    source: Option<IssueSource>,
) -> Result<Vc<ResolveResult>> {
    Ok(match result.await {
        Ok(result_ref) => {
            if result_ref.is_unresolvable() {
                emit_unresolvable_issue(
                    error_mode,
                    &origin_path,
                    reference_type,
                    request,
                    resolve_options,
                    source,
                )
                .await?;
            }

            handle_item_issues(result_ref.errors(), &origin_path, source).await?;

            result
        }
        Err(err) => {
            emit_resolve_error_issue(
                error_mode,
                &origin_path,
                reference_type,
                request,
                resolve_options,
                err,
                source,
            )
            .await?;
            ResolveResult::unresolvable().cell()
        }
    })
}

async fn handle_item_issues(
    items: impl Iterator<Item = ResolvedVc<Box<dyn Issue>>>,
    origin_path: &FileSystemPath,
    source: Option<IssueSource>,
) -> Result<()> {
    let mut items = items.peekable();
    if items.peek().is_some() {
        for item in items {
            let trait_ref = item.into_trait_ref().await?;
            ResolvingIssueWithLocation {
                inner: item,
                severity: trait_ref.severity(),
                stage: trait_ref.stage(),
                documentation_link: trait_ref.documentation_link(),
                file_path: origin_path.clone(),
                source,
            }
            .resolved_cell()
            .emit();
        }
    }
    Ok(())
}

async fn emit_resolve_error_issue(
    error_mode: ResolveErrorMode,
    origin_path: &FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    err: anyhow::Error,
    source: Option<IssueSource>,
) -> Result<()> {
    if error_mode == ResolveErrorMode::Ignore {
        return Ok(());
    }
    let severity = if error_mode == ResolveErrorMode::Warn || resolve_options.await?.loose_errors {
        IssueSeverity::Warning
    } else {
        IssueSeverity::Error
    };
    ResolvingIssue {
        severity,
        file_path: origin_path.clone(),
        request_type: format!("{reference_type} request"),
        request: request.to_resolved().await?,
        resolve_options: resolve_options.to_resolved().await?,
        error_message: Some(format!("{}", PrettyPrintError(&err))),
        source,
    }
    .resolved_cell()
    .emit();
    Ok(())
}

async fn emit_unresolvable_issue(
    error_mode: ResolveErrorMode,
    origin_path: &FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    source: Option<IssueSource>,
) -> Result<()> {
    if error_mode == ResolveErrorMode::Ignore {
        return Ok(());
    }
    let severity = if error_mode == ResolveErrorMode::Warn || resolve_options.await?.loose_errors {
        IssueSeverity::Warning
    } else {
        IssueSeverity::Error
    };
    ResolvingIssue {
        severity,
        file_path: origin_path.clone(),
        request_type: format!("{reference_type} request"),
        request: request.to_resolved().await?,
        resolve_options: resolve_options.to_resolved().await?,
        error_message: None,
        source,
    }
    .resolved_cell()
    .emit();
    Ok(())
}

pub async fn resolve_error_severity(resolve_options: Vc<ResolveOptions>) -> Result<IssueSeverity> {
    Ok(if resolve_options.await?.loose_errors {
        IssueSeverity::Warning
    } else {
        IssueSeverity::Error
    })
}

/// Delegates to the inner issue but overrides the file path and source information.
#[turbo_tasks::value(shared)]
pub struct ResolvingIssueWithLocation {
    pub inner: ResolvedVc<Box<dyn Issue>>,
    pub severity: IssueSeverity,
    pub stage: IssueStage,
    pub documentation_link: RcStr,
    pub file_path: FileSystemPath,
    pub source: Option<IssueSource>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ResolvingIssueWithLocation {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    fn stage(&self) -> IssueStage {
        self.stage.clone()
    }

    async fn title(&self) -> Result<StyledString> {
        self.inner.into_trait_ref().await?.title().await
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        self.inner.into_trait_ref().await?.description().await
    }

    async fn detail(&self) -> Result<Option<StyledString>> {
        self.inner.into_trait_ref().await?.detail().await
    }

    fn documentation_link(&self) -> RcStr {
        self.documentation_link.clone()
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }
}
