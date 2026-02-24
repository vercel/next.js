use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{IntoTraitRef, PrettyPrintError, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString, resolve::ResolvingIssue,
    },
    reference_type::ReferenceType,
    resolve::{
        ModuleResolveResult, ResolveErrorMode, ResolveResult, options::ResolveOptions,
        origin::ResolveOrigin, parse::Request,
    },
};

pub async fn handle_resolve_error(
    result: Vc<ModuleResolveResult>,
    reference_type: ReferenceType,
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    error_mode: ResolveErrorMode,

    source: Option<IssueSource>,
) -> Result<Vc<ModuleResolveResult>> {
    Ok(match result.await {
        Ok(result_ref) => {
            if result_ref.is_unresolvable_ref() {
                emit_unresolvable_issue(
                    error_mode,
                    origin,
                    reference_type,
                    request,
                    resolve_options,
                    source,
                )
                .await?;
            }

            handle_item_issues(result_ref.errors(), origin, source).await?;

            result
        }
        Err(err) => {
            emit_resolve_error_issue(
                error_mode,
                origin,
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
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    error_mode: ResolveErrorMode,
    source: Option<IssueSource>,
) -> Result<Vc<ResolveResult>> {
    Ok(match result.await {
        Ok(result_ref) => {
            if result_ref.is_unresolvable_ref() {
                emit_unresolvable_issue(
                    error_mode,
                    origin,
                    reference_type,
                    request,
                    resolve_options,
                    source,
                )
                .await?;
            }

            handle_item_issues(result_ref.errors(), origin, source).await?;

            result
        }
        Err(err) => {
            emit_resolve_error_issue(
                error_mode,
                origin,
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
    origin: Vc<Box<dyn ResolveOrigin>>,
    source: Option<IssueSource>,
) -> Result<()> {
    let mut items = items.peekable();
    if items.peek().is_some() {
        let file_path = origin.origin_path().owned().await?;
        for item in items {
            ResolvingIssueWithLocation {
                inner: item,
                severity: item.into_trait_ref().await?.severity(),
                file_path: file_path.clone(),
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
    origin: Vc<Box<dyn ResolveOrigin>>,
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
        file_path: origin.origin_path().owned().await?,
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

    origin: Vc<Box<dyn ResolveOrigin>>,
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
        file_path: origin.origin_path().owned().await?,
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
    pub file_path: FileSystemPath,
    pub source: Option<IssueSource>,
}

#[turbo_tasks::value_impl]
impl Issue for ResolvingIssueWithLocation {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        self.inner.stage()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        self.inner.title()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        self.inner.description()
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        self.inner.detail()
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> Vc<RcStr> {
        self.inner.documentation_link()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(self.source)
    }
}
