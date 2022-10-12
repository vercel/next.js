use std::sync::Arc;

use swc_core::common::{
    errors::{DiagnosticBuilder, DiagnosticId, Emitter, Level},
    source_map::Pos,
    SourceMap,
};
use turbo_tasks::primitives::StringVc;
use turbopack_core::{
    asset::AssetVc,
    issue::{analyze::AnalyzeIssue, IssueSeverity, IssueSourceVc},
};

pub struct IssueEmitter {
    pub source: AssetVc,
    pub source_map: Arc<SourceMap>,
    pub title: Option<String>,
}

impl Emitter for IssueEmitter {
    fn emit(&mut self, db: &DiagnosticBuilder<'_>) {
        let level = db.level;
        let mut message = db
            .message
            .iter()
            .map(|(s, _)| s.as_ref())
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
            message = message_split.as_str().to_string();
        }

        let source = db.span.primary_span().map(|span| {
            IssueSourceVc::from_byte_offset(
                self.source,
                self.source_map.lookup_byte_offset(span.lo()).pos.to_usize(),
                self.source_map.lookup_byte_offset(span.lo()).pos.to_usize(),
            )
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
            category: StringVc::cell("parse".to_string()),
            path: self.source.path(),
            title: StringVc::cell(title),
            message: StringVc::cell(message),
            code,
            source,
        }
        .cell();
        issue.as_issue().emit();
    }
}
