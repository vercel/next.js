use std::sync::Arc;

use swc_core::common::{
    errors::{DiagnosticBuilder, DiagnosticId, Emitter, Level},
    source_map::Pos,
    SourceMap,
};
use turbo_tasks::Vc;
use turbopack_core::{
    issue::{analyze::AnalyzeIssue, IssueExt, IssueSeverity, IssueSource, StyledString},
    source::Source,
};

pub struct IssueEmitter {
    pub source: Vc<Box<dyn Source>>,
    pub source_map: Arc<SourceMap>,
    pub title: Option<String>,
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
            DiagnosticId::Error(s) => format!("error {s}"),
            DiagnosticId::Lint(s) => format!("lint {s}"),
        });

        let title;
        if let Some(t) = self.title.as_ref() {
            title = t.clone();
        } else {
            let mut message_split = message.split('\n');
            title = message_split.next().unwrap().to_string();
            message = message_split.remainder().unwrap_or("").to_string();
        }

        let source = db.span.primary_span().map(|span| {
            IssueSource::from_swc_offsets(self.source, span.lo.to_usize(), span.hi.to_usize())
        });
        // TODO add other primary and secondary spans with labels as sub_issues

        AnalyzeIssue {
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
            message: StyledString::Text(message).cell(),
            code,
            source,
        }
        .cell()
        .emit();
    }
}
