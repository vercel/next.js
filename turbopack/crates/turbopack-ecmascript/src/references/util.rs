use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use swc_core::{
    common::{
        Span,
        errors::{DiagnosticId, HANDLER},
    },
    ecma::ast::Expr,
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs, turbofmt};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    self,
    chunk::ChunkingType,
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    resolve::{ModuleResolveResult, parse::Request, pattern::Pattern},
};

use crate::errors;

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

/// Creates a Promise that rejects with a "Cannot find module" error for the
/// given request string. Use this for async contexts (dynamic imports).
pub fn throw_module_not_found_expr_async(request: &str) -> Expr {
    let message = format!("Cannot find module '{request}'");
    quote!(
        "Promise.resolve().then(() => { const e = new Error($message); e.code = 'MODULE_NOT_FOUND'; throw e; })"
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

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for TooManyMatchesWarning {
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(
            turbofmt!(
                "The file pattern {} matches {} files in {}",
                self.pattern,
                self.num_matches,
                self.context_dir
            )
            .await?,
        ))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(rcstr!(
            "Overly broad patterns can lead to build performance issues and over bundling."
        ))))
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().await
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Encode, Decode, TraceRawVcs, NonLocalValue)]
pub enum SpecifiedChunkingType {
    Parallel,
    Shared,
    None,
}

impl SpecifiedChunkingType {
    pub fn as_chunking_type(&self, inherit_async: bool, hoisted: bool) -> Option<ChunkingType> {
        match self {
            SpecifiedChunkingType::Parallel => Some(ChunkingType::Parallel {
                inherit_async,
                hoisted,
            }),
            SpecifiedChunkingType::Shared => Some(ChunkingType::Shared {
                inherit_async,
                merge_tag: None,
            }),
            SpecifiedChunkingType::None => None,
        }
    }
}

pub fn parse_chunking_type_annotation(
    span: Span,
    chunking_type_annotation: &str,
) -> Option<SpecifiedChunkingType> {
    match chunking_type_annotation {
        "parallel" => Some(SpecifiedChunkingType::Parallel),
        "shared" => Some(SpecifiedChunkingType::Shared),
        "none" => Some(SpecifiedChunkingType::None),
        _ => {
            HANDLER.with(|handler| {
                handler.span_err_with_code(
                    span,
                    &format!(
                        "Unknown specified chunking-type: \"{chunking_type_annotation}\", \
                         expected \"parallel\", \"shared\" or \"none\""
                    ),
                    DiagnosticId::Error(
                        errors::failed_to_analyze::ecmascript::CHUNKING_TYPE.into(),
                    ),
                );
            });
            None
        }
    }
}
