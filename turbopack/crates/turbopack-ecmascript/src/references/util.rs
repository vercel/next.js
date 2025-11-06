use anyhow::Result;
use swc_core::{ecma::ast::Expr, quote};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    self,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    resolve::{ModuleResolveResult, parse::Request, pattern::Pattern},
};

/// Creates a IIFE expression that throws a "Cannot find module" error for the
/// given request string
pub fn throw_module_not_found_expr(request: &str) -> Expr {
    let message = format!("Cannot find module '{request}'");
    quote!(
        "(() => { const e = new Error($message); e.code = 'MODULE_NOT_FOUND'; throw e; })()"
            as Expr,
        message: Expr = message.into()
    )
}

/// Creates a IIFE expression that throws a "Cannot find module" error for the
/// given request string
pub fn throw_module_not_found_error_expr(request: &str, message: &str) -> Expr {
    let message = format!("Cannot find module '{request}': {message}");
    quote!(
        "(() => { const e = new Error($message); e.code = 'MODULE_NOT_FOUND'; throw e; })()"
            as Expr,
        message: Expr = message.into()
    )
}

#[turbo_tasks::function]
pub async fn request_to_string(request: Vc<Request>) -> Result<Vc<RcStr>> {
    Ok(Vc::cell(
        request
            .await?
            .request()
            // TODO: Handle Request::Dynamic, Request::Alternatives
            .unwrap_or(rcstr!("unknown")),
    ))
}

/// If a pattern resolves to more than 10000 results, it's likely a mistake so issue a warning.
const TOO_MANY_MATCHES_LIMIT: usize = 10000;

pub async fn check_and_emit_too_many_matches_warning(
    result: Vc<ModuleResolveResult>,
    issue_source: IssueSource,
    context_dir: FileSystemPath,
    pattern: ResolvedVc<Pattern>,
) -> Result<()> {
    let num_matches = result.await?.primary.len();
    if num_matches > TOO_MANY_MATCHES_LIMIT {
        TooManyMatchesWarning {
            source: issue_source,
            context_dir,
            num_matches,
            pattern,
        }
        .resolved_cell()
        .emit();
    }
    Ok(())
}

#[turbo_tasks::value(shared)]
struct TooManyMatchesWarning {
    source: IssueSource,
    context_dir: FileSystemPath,
    num_matches: usize,
    pattern: ResolvedVc<Pattern>,
}

#[turbo_tasks::value_impl]
impl Issue for TooManyMatchesWarning {
    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Text(
            format!(
                "The file pattern {pattern} matches {num_matches} files in {context_dir}",
                pattern = self.pattern.to_string().await?,
                context_dir = self.context_dir.value_to_string().await?,
                num_matches = self.num_matches
            )
            .into(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(rcstr!(
                "Overly broad patterns can lead to build performance issues and over bundling."
            ))
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    async fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Resolve.cell()
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}
