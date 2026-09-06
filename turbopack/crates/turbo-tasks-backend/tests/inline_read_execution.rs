#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Reading a task that is scheduled but not started yet must execute that task *inline* on the
//! reading thread, so the read can complete without ever returning `Poll::Pending`.
//!
//! Most tests run on a single tokio worker on purpose: with `worker_threads = 1` the
//! `PriorityRunner`'s target worker count is 1, so a task scheduled from inside another task's
//! execution is always queued (never immediately spawned). That makes "the task is still in the
//! priority runner when it is read" deterministic. The tests that are about contention
//! (`test_read_of_running_task_is_not_executed_again`, `test_read_outcome_counters`) use more.

use std::{
    future::{Future, IntoFuture},
    pin::pin,
    sync::atomic::{AtomicUsize, Ordering},
    task::{Context, Poll, Waker},
};

use anyhow::Result;
use turbo_tasks::{ReadRef, ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

/// Polls `fut` exactly once with a non-waking waker.
fn poll_once<F: Future>(fut: F) -> Poll<F::Output> {
    let mut fut = pin!(fut);
    let waker = Waker::noop();
    let mut cx = Context::from_waker(waker);
    fut.as_mut().poll(&mut cx)
}

/// A read of a not-yet-started task completes in a single poll, because the reader picks the
/// task up from the priority runner and executes it inline.
#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn test_read_of_scheduled_task_is_inline() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            read_scheduled_task_inline(nonce)
                .read_strongly_consistent()
                .await
        }
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
async fn read_scheduled_task_inline(nonce: u32) -> Result<Vc<()>> {
    // `leaf` has never been computed and completes without awaiting anything, so the read must
    // resolve in the very first poll.
    let leaf_vc = leaf(nonce);
    let Poll::Ready(result) = poll_once(leaf_vc.into_future()) else {
        panic!("reading a scheduled-but-not-started task did not complete inline");
    };
    assert_eq!(result?.value, 42);

    // A second read hits the cache and obviously stays inline.
    let Poll::Ready(result) = poll_once(leaf(nonce).into_future()) else {
        panic!("reading a completed task did not complete inline");
    };
    assert_eq!(result?.value, 42);

    Ok(Vc::cell(()))
}

/// When the inline execution yields, the read parks as usual and the execution is completed
/// elsewhere — the value must still arrive.
#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn test_read_of_yielding_task_still_completes() {
    let mut nonce = 0;
    read_yielding_task(&mut nonce).await;
}

async fn read_yielding_task(nonce: &mut u32) {
    run_once(&REGISTRATION, {
        *nonce += 1;
        let nonce = *nonce;
        move || async move {
            read_yielding_task_operation(nonce)
                .read_strongly_consistent()
                .await
        }
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
async fn read_yielding_task_operation(nonce: u32) -> Result<Vc<()>> {
    // `yielding_leaf` yields during its execution, so the inline poll cannot finish it. The read
    // has to park — and the value must still be produced.
    let vc = yielding_leaf(nonce);
    assert!(
        poll_once(vc.into_future()).is_pending(),
        "a task that yields must not resolve in the first poll"
    );
    assert_eq!(vc.await?.value, 7);

    Ok(Vc::cell(()))
}

/// A call with unresolved arguments creates a *local* task. Reading its output must execute the
/// local task (and the global task it resolves to) inline as well.
#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn test_read_of_local_task_is_inline() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            read_local_task_inline(nonce)
                .read_strongly_consistent()
                .await
        }
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
async fn read_local_task_inline(nonce: u32) -> Result<Vc<()>> {
    // An unresolved `Vc` argument: `identity` is called with the not-yet-resolved output of
    // `leaf`, which creates a local resolve task.
    let leaf_vc = leaf(nonce);
    assert_eq!(leaf_vc.await?.value, 42);

    let local_vc = identity(leaf_vc);
    let Poll::Ready(result) = poll_once(local_vc.into_future()) else {
        panic!("reading a scheduled local task did not complete inline");
    };
    assert_eq!(result?.value, 42);

    Ok(Vc::cell(()))
}

/// Reports how reads and inline execution interacted, and checks the invariants of the counters.
///
/// Deliberately does *not* assert a particular mix: what a read finds depends on how loaded the
/// scheduler is. On a small, idle instance like this one, `connect_child` schedules each fresh task
/// eagerly and the worker it spawns wins the race against the reader, so claims mostly fail; in a
/// saturated build the tasks stay queued and the reader takes them over instead. Both are correct,
/// and the printed histogram is the point of this test.
///
/// In particular `waited_in_progress` cannot be asserted here: a worker pops a task from the queue
/// *before* `try_start_task_execution` flips the state to `InProgress`, so a read that lands in
/// that window still sees `Scheduled` and attempts a claim that cannot succeed. Whether a read sees
/// `Scheduled` or `InProgress` is therefore a matter of timing by design — it is a hint, and acting
/// on a stale one only costs a failed claim.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_read_outcome_counters() {
    let tt = create_test_turbo_tasks("test_read_outcome_counters", true);

    let before = tt.inline_execution_stats();
    turbo_tasks::run_once(tt.clone(), async move {
        read_many_leaves(1, 21).read_strongly_consistent().await?;
        Ok(())
    })
    .await
    .unwrap();
    let after = tt.inline_execution_stats();

    println!("stats before: {before:#?}\nstats after: {after:#?}");
    assert!(
        after.claim_attempted > before.claim_attempted,
        "reads that find a task queued must try to take it over"
    );
    assert_eq!(
        after.claim_attempted - before.claim_attempted,
        (after.claim_completed - before.claim_completed)
            + (after.claim_yielded - before.claim_yielded)
            + (after.claim_failed - before.claim_failed),
        "every claim attempt has exactly one outcome"
    );
}

/// A task that is invalidated *while it is being executed* is stale and gets scheduled again, so a
/// read can go around the retry more than once. It has to terminate, and it must not grow the
/// native stack per retry (which is why the retry is a loop and not recursion).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_stale_during_execution_terminates() {
    let result = tokio::time::timeout(std::time::Duration::from_secs(60), async {
        run_once(&REGISTRATION, || async {
            let input = ReadRef::resolved_cell(ReadRef::new_owned(ChangingInput {
                state: State::new(0),
            }));
            let output = self_invalidating(input);
            // The task bumps the state it depends on the first few times it runs, invalidating
            // itself, so this read has to survive several rescheduled executions.
            assert!(output.read_strongly_consistent().await?.value >= 3);
            Ok(())
        })
        .await
        .unwrap();
    })
    .await;
    assert!(
        result.is_ok(),
        "a task that keeps invalidating itself must still settle"
    );
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::function(operation, root)]
async fn self_invalidating(input: ResolvedVc<ChangingInput>) -> Result<Vc<Value>> {
    let value = *input.await?.state.get();
    if value < 3 {
        // Invalidate ourselves: the execution that is running right now becomes stale and is
        // scheduled again.
        input.await?.state.set(value + 1);
    }
    Ok(Value { value: value + 1 }.cell())
}

/// Restoring from a persistent cache in a fresh instance — what an incremental build does — must
/// recompute what it cannot reuse, produce the right values, and not panic.
///
/// Worth keeping even though it looks mundane: reads behave differently here than in a cold build
/// (tasks come back dirty and are recomputed rather than found in the queue), and every other test
/// in this file — like every cold build — never exercises that.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_restore_from_persistent_cache_recomputes_and_does_not_panic() {
    let name = "test_restore_from_persistent_cache_recomputes";

    // First instance: compute the tasks and flush them to the persistent cache.
    let first = create_test_turbo_tasks(name, true);
    turbo_tasks::run_once(first.clone(), async move {
        read_session_leaves(21).read_strongly_consistent().await?;
        Ok(())
    })
    .await
    .unwrap();
    first.stop_and_wait().await;

    // Second instance on the same cache: the session-dependent results cannot be reused, so they
    // have to be recomputed.
    let second = create_test_turbo_tasks(name, false);
    let before = second.inline_execution_stats();
    turbo_tasks::run_once(second.clone(), async move {
        read_session_leaves(21).read_strongly_consistent().await?;
        Ok(())
    })
    .await
    .unwrap();
    let after = second.inline_execution_stats();
    second.stop_and_wait().await;

    println!("stats before: {before:#?}\nstats after: {after:#?}");
    assert!(
        after.queued > before.queued,
        "the session-dependent tasks must be recomputed after the restore"
    );
}

/// Builds a `TurboTasks` on a per-name persistence directory. `initial` wipes that directory first;
/// passing `false` reuses what a previous instance flushed, which is how an incremental build
/// starts up.
fn create_test_turbo_tasks(
    name: &str,
    initial: bool,
) -> std::sync::Arc<turbo_tasks::TurboTasks<turbo_tasks_backend::TurboTasksBackend>> {
    let inner = include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/test_config.trs"
    ));
    (inner)(name, initial)
}

#[turbo_tasks::function(operation, root)]
async fn read_session_leaves(leaves: u32) -> Result<Vc<()>> {
    for i in 0..leaves {
        assert_eq!(session_leaf(i).await?.value, i + 1);
    }
    Ok(Vc::cell(()))
}

/// Session-dependent, so its result is not reused across `TurboTasks` instances: a second instance
/// restoring from the same persistent cache has to recompute it, and the read is what schedules it.
#[turbo_tasks::function(session_dependent)]
async fn session_leaf(index: u32) -> Result<Vc<Value>> {
    Ok(Value { value: index + 1 }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn read_many_leaves(nonce: u32, leaves: u32) -> Result<Vc<()>> {
    for i in 0..leaves {
        // Every leaf is a distinct, never-computed task.
        assert_eq!(leaf(nonce * 1000 + i).await?.value, 42);
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: u32,
}

/// A task whose execution is already in progress is not executed a second time, and reading it
/// works as it always did.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_read_of_running_task_is_not_executed_again() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            read_running_task(nonce)
                .read_strongly_consistent()
                .await
                .map(|_| ())
        }
    })
    .await
    .unwrap();
    assert_eq!(
        COUNTED_EXECUTIONS.load(Ordering::SeqCst),
        1,
        "the task must be executed exactly once, no matter how many readers race for it"
    );
}

/// Only `read_running_task` may use this: it is process-global, and that operation resets it at the
/// start of each execution.
static COUNTED_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

#[turbo_tasks::function(operation, root)]
async fn read_running_task(nonce: u32) -> Result<Vc<()>> {
    COUNTED_EXECUTIONS.store(0, Ordering::SeqCst);
    // Eight readers of the same task, spread over the worker threads: at most one of them can
    // execute it (inline or on a worker), the others have to wait for it.
    let mut values = Vec::new();
    for _ in 0..8 {
        values.push(counted_leaf(nonce));
    }
    for value in values {
        assert_eq!(value.await?.value, 5);
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn counted_leaf(nonce: u32) -> Result<Vc<Value>> {
    // Keeps `nonce` in the cache key: `#[turbo_tasks::function]` filters out arguments the body
    // never uses, and then every run would reuse the first run's cached value.
    let _ = nonce;
    COUNTED_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    // Yield so the other readers reach the task while it is in progress.
    tokio::task::yield_now().await;
    Ok(Value { value: 5 }.cell())
}

/// Inline execution nests: reading the deepest task of a chain of uncomputed tasks executes them
/// one inside the other. The nesting cap keeps that from growing the stack without bounds.
#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn test_deep_dependency_chain() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            deep_chain_operation(nonce)
                .read_strongly_consistent()
                .await
                .map(|_| ())
        }
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
async fn deep_chain_operation(nonce: u32) -> Result<Vc<()>> {
    // Reading the top of the chain requires computing all 500 links, each of which reads the next
    // one as the first thing it does.
    assert_eq!(chain_link(nonce, 500).await?.value, 500);
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn chain_link(nonce: u32, depth: u32) -> Result<Vc<Value>> {
    if depth == 0 {
        return Ok(Value { value: 0 }.cell());
    }
    let inner = chain_link(nonce, depth - 1).await?.value;
    Ok(Value { value: inner + 1 }.cell())
}

#[turbo_tasks::function]
fn leaf(nonce: u32) -> Result<Vc<Value>> {
    let _ = nonce; // keeps `nonce` in the cache key, see `counted_leaf`
    Ok(Value { value: 42 }.cell())
}

#[turbo_tasks::function]
async fn yielding_leaf(nonce: u32) -> Result<Vc<Value>> {
    let _ = nonce; // keeps `nonce` in the cache key, see `counted_leaf`
    tokio::task::yield_now().await;
    Ok(Value { value: 7 }.cell())
}

#[turbo_tasks::function]
async fn identity(input: Vc<Value>) -> Result<Vc<Value>> {
    let value = input.await?.value;
    Ok(Value { value }.cell())
}
