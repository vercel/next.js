#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{
    Vc, mark_top_level_task, read, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: u32,
}

#[turbo_tasks::function(operation, root)]
async fn returns_value_operation() -> Result<Vc<Value>> {
    Ok(Value { value: 42 }.cell())
}

/// Test that eventually consistent reads (default .await) cause an error in top-level tasks
/// The panic happens but we just verify it's an error, not the exact message
#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
#[should_panic]
async fn test_eventual_read_in_top_level_task_fails() {
    run_once(&REGISTRATION, || async {
        // This should fail because we're in a top-level task (run_once)
        // and doing an eventually consistent read (default .await)
        returns_value_operation().connect().await
    })
    .await
    .unwrap()
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_cell_read_in_top_level_task_succeeds() {
    run_once(&REGISTRATION, || async {
        let cell = returns_value_operation()
            .resolve()
            .strongly_consistent()
            .await?;
        let value = cell.await?;
        assert_eq!(value.value, 42);
        Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_manual_mark_unmark_top_level_task() {
    run_once(&REGISTRATION, || async {
        // We're in a top-level task initially, but let's unmark it
        unmark_top_level_task_may_leak_eventually_consistent_state();

        // Now eventually consistent reads should work
        let value = returns_value_operation().connect().await?;
        assert_eq!(value.value, 42);

        // Re-mark as top-level task
        mark_top_level_task();

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// ASYNC-ONLY BY DESIGN: asserts the debug-assertion that fires when an *eventually
// consistent* read happens inside a top-level task. That guard exists to catch leaking
// async eventual-consistency state; under the synchronous inline engine reads resolve
// deterministically to a consistent value (there is no eventual inconsistency to leak),
// so the hazard — and thus the guard — does not apply. The guard still works for the
// run_once-root case (see test_eventual_read_in_top_level_task_fails, which passes under
// sync); only this manually-marked nested-operation variant is async-specific.
#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
#[should_panic]
async fn test_manual_mark_top_level_task_causes_error() {
    #[turbo_tasks::function(operation, root)]
    async fn operation() -> Result<Vc<Value>> {
        // Manually mark as top-level task
        mark_top_level_task();

        // This should panic because we marked it as a top-level task
        read!(returns_value_operation().connect())?;

        Ok(Value { value: 42 }.cell())
    }

    run_once(&REGISTRATION, || async {
        operation().read_strongly_consistent().await
    })
    .await
    .unwrap()
}
