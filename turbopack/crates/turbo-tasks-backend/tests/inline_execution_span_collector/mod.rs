//! A tracing layer that records what `inline_execution` each task span ended up with.
//!
//! Shared by `inline_execution_span.rs` and `inline_execution_span_worker.rs`. They have to be
//! separate test binaries: the subscriber must be the *global* default (tasks execute on tokio
//! worker threads, so a thread-local default sees nothing), a process can only set that once, and
//! the two sides need different worker counts — with a single worker a task called from another
//! task is queued and the read executes it, while with workers to spare it is spawned immediately
//! and a worker executes it.
//!
//! Each binary compiles this module separately and uses a different part of it, hence the
//! `allow(dead_code)`.

#![allow(dead_code)]

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use tracing::{
    Subscriber,
    field::{Field, Visit},
    span::{Attributes, Id, Record},
};
use tracing_subscriber::{layer::Context, registry::LookupSpan};

/// `span id -> (task function name, recorded outcome)`.
type SeenSpans = BTreeMap<u64, (String, Option<String>)>;

/// Records, per task span *instance*, what `inline_execution` ended up being. `None` means the span
/// existed but the field was never recorded, which is what a worker-executed task looks like.
#[derive(Clone, Default)]
pub struct InlineExecutionCollector {
    seen: Arc<Mutex<SeenSpans>>,
}

impl InlineExecutionCollector {
    /// Installs this collector as the global default subscriber. Call once per test binary.
    pub fn install(&self) {
        use tracing_subscriber::prelude::*;
        tracing_subscriber::registry().with(self.clone()).init();
    }

    /// The outcomes of every execution of the task with this function name.
    pub fn outcomes_for(&self, task_name: &str) -> Vec<Option<String>> {
        self.seen
            .lock()
            .unwrap()
            .values()
            .filter(|(name, _)| name == task_name)
            .map(|(_, outcome)| outcome.clone())
            .collect()
    }

    /// Every recorded `(task name, outcome)` pair, for assertions across all tasks.
    pub fn all_outcomes(&self) -> Vec<(String, Option<String>)> {
        self.seen.lock().unwrap().values().cloned().collect()
    }
}

/// Reads the `name` (task function) and `inline_execution` fields, ignoring everything else.
#[derive(Default)]
struct SpanFieldVisitor {
    task_name: Option<String>,
    inline_execution: Option<String>,
}

impl SpanFieldVisitor {
    fn take(&mut self, field: &Field, value: String) {
        match field.name() {
            "name" => self.task_name = Some(value),
            "inline_execution" => self.inline_execution = Some(value),
            _ => {}
        }
    }
}

impl Visit for SpanFieldVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        self.take(field, value.to_string());
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.take(field, format!("{value:?}").trim_matches('"').to_string());
    }
}

/// Marks a span as one we track, so `on_record` only looks at those.
struct TrackedSpan;

impl<S> tracing_subscriber::Layer<S> for InlineExecutionCollector
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_new_span(&self, attrs: &Attributes<'_>, id: &Id, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(id) else { return };
        if span.name() != "turbo_tasks::function" {
            return;
        }
        let mut visitor = SpanFieldVisitor::default();
        attrs.record(&mut visitor);
        let Some(task_name) = visitor.task_name else {
            return;
        };
        self.seen
            .lock()
            .unwrap()
            .insert(id.into_u64(), (task_name, visitor.inline_execution));
        span.extensions_mut().insert(TrackedSpan);
    }

    fn on_record(&self, id: &Id, values: &Record<'_>, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(id) else { return };
        if span.extensions().get::<TrackedSpan>().is_none() {
            return;
        }
        let mut visitor = SpanFieldVisitor::default();
        values.record(&mut visitor);
        if let Some(outcome) = visitor.inline_execution
            && let Some(entry) = self.seen.lock().unwrap().get_mut(&id.into_u64())
        {
            entry.1 = Some(outcome);
        }
    }
}
