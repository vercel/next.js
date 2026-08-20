#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A task that a read executes on its own thread instead of waiting for a worker records that on
//! *its own* execution span, so a trace shows which executions were inline and whether they
//! finished there.
//!
//! The worker-executed counterpart lives in `inline_execution_span_worker.rs`; see
//! `inline_execution_span_collector` for why they are separate binaries.

mod inline_execution_span_collector;

use anyhow::Result;
use inline_execution_span_collector::InlineExecutionCollector;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn test_inline_execution_is_recorded_on_the_executed_task_span() {
    let collector = InlineExecutionCollector::default();
    collector.install();

    // A single worker means a task called from inside another task is queued rather than
    // immediately spawned, so the read of it is what executes it.
    run_once(&REGISTRATION, || async {
        assert_eq!(read_leaves().read_strongly_consistent().await?.value, 49);
        Ok(())
    })
    .await
    .unwrap();

    let leaf_outcomes = collector.outcomes_for("leaf");
    let yielding_outcomes = collector.outcomes_for("yielding_leaf");
    println!("all outcomes: {:?}", collector.all_outcomes());

    // `leaf` has no await points, so the reader's single poll finishes it.
    assert!(
        leaf_outcomes.contains(&Some("complete".to_string())),
        "a task executed inline to completion must record it on its own span, got \
         {leaf_outcomes:?}"
    );
    // `yielding_leaf` yields, so it is handed to the runtime after the reader's first poll.
    assert!(
        yielding_outcomes.contains(&Some("partial".to_string())),
        "an inline execution that yielded must record \"partial\", got {yielding_outcomes:?}"
    );
    // Nothing else ever lands in the field.
    for (task_name, outcome) in collector.all_outcomes() {
        assert!(
            matches!(
                outcome.as_deref(),
                None | Some("complete") | Some("partial")
            ),
            "unexpected inline_execution value on {task_name}: {outcome:?}"
        );
    }
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: u32,
}

#[turbo_tasks::function]
async fn leaf() -> Result<Vc<Value>> {
    Ok(Value { value: 42 }.cell())
}

#[turbo_tasks::function]
async fn yielding_leaf() -> Result<Vc<Value>> {
    tokio::task::yield_now().await;
    Ok(Value { value: 7 }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn read_leaves() -> Result<Vc<Value>> {
    let value = leaf().await?.value + yielding_leaf().await?.value;
    Ok(Value { value }.cell())
}
