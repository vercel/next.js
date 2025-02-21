use std::{mem::take, sync::Arc};

use anyhow::Result;
use parking_lot::Mutex;
use swc_core::common::{
    errors::{DiagnosticBuilder, DiagnosticId, Emitter, Level},
    source_map::SmallPos,
    SourceMap,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    issue::{analyze::AnalyzeIssue, IssueExt, IssueSeverity, IssueSource, StyledString},
    source::Source,
};

#[must_use]
pub struct IssueCollector {
    inner: Arc<Mutex<IssueCollectorInner>>,
}

impl IssueCollector {
    pub async fn emit(self) -> Result<()> {
        let issues = {
            let mut inner = self.inner.lock();
            take(&mut inner.emitted_issues)
        };

        for issue in issues {
            issue.to_resolved().await?.emit();
        }
        Ok(())
    }

    pub fn last_emitted_issue(&self) -> Option<Vc<AnalyzeIssue>> {
        let inner = self.inner.lock();
        inner.emitted_issues.last().copied()
    }
}

struct IssueCollectorInner {
    emitted_issues: Vec<Vc<AnalyzeIssue>>,
}

pub struct IssueEmitter {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub source_map: Arc<SourceMap>,
    pub title: Option<RcStr>,
    inner: Arc<Mutex<IssueCollectorInner>>,
}

impl IssueEmitter {
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        source_map: Arc<SourceMap>,
        title: Option<RcStr>,
    ) -> (Self, IssueCollector) {
        let inner = Arc::new(Mutex::new(IssueCollectorInner {
            emitted_issues: vec![],
        }));
        (
            Self {
                source,
                source_map,
                title,
                inner: inner.clone(),
            },
            IssueCollector { inner },
        )
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
            .is_some_and(|d| matches!(d, DiagnosticId::Lint(_)));

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
            IssueSource::from_swc_offsets(self.source, span.lo.to_u32(), span.hi.to_u32())
        });
        // TODO add other primary and secondary spans with labels as sub_issues

        let issue = AnalyzeIssue::new(
            *severity,
            self.source.ident(),
            Vc::cell(title),
            StyledString::Text(message.into()).cell(),
            code,
            source,
        );

        let mut inner = self.inner.lock();
        inner.emitted_issues.push(issue);
    }
}
