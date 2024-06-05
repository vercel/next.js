use std::sync::Arc;

use swc_core::common::{
    errors::{DiagnosticBuilder, DiagnosticId, Emitter, Level},
    source_map::Pos,
    SourceMap,
};
use turbo_tasks::{RcStr, Vc};
use turbopack_core::{
    issue::{analyze::AnalyzeIssue, IssueExt, IssueSeverity, IssueSource, StyledString},
    source::Source,
};

#[derive(Clone)]
pub struct IssueEmitter {
    pub source: Vc<Box<dyn Source>>,
    pub source_map: Arc<SourceMap>,
    pub title: Option<RcStr>,
    pub emitted_issues: Vec<Vc<AnalyzeIssue>>,
}

impl IssueEmitter {
    pub fn new(
        source: Vc<Box<dyn Source>>,
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

        let title;
        if let Some(t) = self.title.as_ref() {
            title = t.clone();
        } else {
            let mut message_split = message.split('\n');
            title = message_split.next().unwrap().to_string().into();
            message = message_split.remainder().unwrap_or("").to_string();
        }

        let source = db.span.primary_span().map(|span| {
            IssueSource::from_swc_offsets(self.source, span.lo.to_usize(), span.hi.to_usize())
        });
        // TODO add other primary and secondary spans with labels as sub_issues

        let issue = AnalyzeIssue {
            severity: match level {
                Level::Bug => IssueSeverity::Bug,
                Level::Fatal | Level::PhaseFatal => IssueSeverity::Fatal,
                Level::Error => IssueSeverity::Error,
                Level::Warning => IssueSeverity::Warning,
                Level::Note => IssueSeverity::Note,
                Level::Help => IssueSeverity::Hint,
                Level::Cancelled => IssueSeverity::Error,
                Level::FailureNote => IssueSeverity::Note,
            }
            .cell(),
            source_ident: self.source.ident(),
            title: Vc::cell(title),
            message: StyledString::Text(message.into()).cell(),
            code,
            source,
        }
        .cell();

        self.emitted_issues.push(issue);

        issue.emit();
    }
}
