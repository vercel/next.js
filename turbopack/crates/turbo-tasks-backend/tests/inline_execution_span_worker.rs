#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! The counterpart to `inline_execution_span.rs`: a task that a *worker* executes must not be
//! labelled as inline-executed.
//!
//! Needs several workers — with workers to spare, scheduling a task spawns it immediately instead
//! of queuing it, which is what makes it worker-executed here. See
//! `inline_execution_span_collector` for why this is a separate binary.

mod inline_execution_span_collector;

use std::time::Duration;

use anyhow::Result;
use inline_execution_span_collector::InlineExecutionCollector;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_worker_executed_task_is_not_labelled_inline() {
    let collector = InlineExecutionCollector::default();
    collector.install();

    run_once(&REGISTRATION, || async {
        assert_eq!(
            schedule_then_read().read_strongly_consistent().await?.value,
            42
        );
        Ok(())
    })
    .await
    .unwrap();

    let outcomes = collector.outcomes_for("worker_leaf");
    println!("worker_leaf: {outcomes:?}");
    assert!(
        !outcomes.is_empty(),
        "the task must have been executed at least once"
    );
    assert!(
        outcomes.iter().all(|outcome| outcome.is_none()),
        "a task executed by a worker must not record inline_execution, got {outcomes:?}"
    );
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: u32,
}

#[turbo_tasks::function]
async fn worker_leaf() -> Result<Vc<Value>> {
    Ok(Value { value: 42 }.cell())
}

#[turbo_tasks::function]
async fn slow_leaf() -> Result<Vc<Value>> {
    tokio::time::sleep(Duration::from_millis(200)).await;
    Ok(Value { value: 1 }.cell())
}

/// Creates `worker_leaf` — which, with workers to spare, is spawned immediately rather than queued
/// — and only reads it after waiting long enough that a worker has taken it. The read therefore
/// finds nothing to claim, so nothing is executed inline for it.
#[turbo_tasks::function(operation, root)]
async fn schedule_then_read() -> Result<Vc<Value>> {
    let deferred = worker_leaf();
    slow_leaf().await?;
    let value = deferred.await?.value;
    Ok(Value { value }.cell())
}
