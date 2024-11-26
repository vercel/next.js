use std::sync::Arc;

use swc_core::common::{
    errors::{DiagnosticBuilder, DiagnosticId, Emitter, Level},
    source_map::SmallPos,
    SourceMap,
};
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbopack_core::{
    issue::{analyze::AnalyzeIssue, IssueExt, IssueSeverity, IssueSource, StyledString},
    source::Source,
};

#[derive(Clone)]
pub struct IssueEmitter {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub source_map: Arc<SourceMap>,
    pub title: Option<RcStr>,
    pub emitted_issues: Vec<ResolvedVc<AnalyzeIssue>>,
}

impl IssueEmitter {
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        source_map: Arc<SourceMap>,
        title: Option<RcStr>,
    ) -> Self {
        Self {
            source,
            source_map,
            title,
            emitted_issues: vec![],
        }
    }
}

impl Emitter for IssueEmitter {
    fn emit(&mut self, db: &DiagnosticBuilder<'_>) {
        let level = db.level;
        let mut message = db
            .message
            .iter()
            .map(|s| s.0.as_ref())
            .collect::<Vec<_>>()
            .join("");
        let code = db.code.as_ref().map(|d| match d {
            DiagnosticId::Error(s) => format!("error {s}").into(),
            DiagnosticId::Lint(s) => format!("lint {s}").into(),
        });
        let is_lint = db
            .code
            .as_ref()
            .map_or(false, |d| matches!(d, DiagnosticId::Lint(_)));

        let severity = (if is_lint {
            IssueSeverity::Suggestion
        } else {
            match level {
                Level::Bug => IssueSeverity::Bug,
                Level::Fatal | Level::PhaseFatal => IssueSeverity::Fatal,
                Level::Error => IssueSeverity::Error,
                Level::Warning => IssueSeverity::Warning,
                Level::Note => IssueSeverity::Note,
                Level::Help => IssueSeverity::Hint,
                Level::Cancelled => IssueSeverity::Error,
                Level::FailureNote => IssueSeverity::Note,
            }
        })
        .resolved_cell();

        let title;
        if let Some(t) = self.title.as_ref() {
            title = t.clone();
        } else {
            let mut message_split = message.split('\n');
            title = message_split.next().unwrap().to_string().into();
            message = message_split.remainder().unwrap_or("").to_string();
        }

        let source = db.span.primary_span().map(|span| {
            IssueSource::from_swc_offsets(*self.source, span.lo.to_usize(), span.hi.to_usize())
        });
        // TODO add other primary and secondary spans with labels as sub_issues

        let issue = AnalyzeIssue {
            severity,
            source_ident: self.source.ident(),
            title: ResolvedVc::cell(title),
            message: StyledString::Text(message.into()).resolved_cell(),
            code,
            source,
        }
        .resolved_cell();

        self.emitted_issues.push(issue);

        issue.emit();
    }
}
