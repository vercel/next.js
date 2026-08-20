#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Reading a task that is scheduled but not started yet must execute that task *inline* on the
//! reading thread, so the read can complete without ever returning `Poll::Pending`.
//!
//! All tests run on a single tokio worker on purpose: with `worker_threads = 1` the
//! `PriorityRunner`'s target worker count is 1, so a task scheduled from inside another task's
//! execution is always queued (never immediately spawned). That makes "the task is still in the
//! priority runner when it is read" deterministic.

use std::{
    future::{Future, IntoFuture},
    pin::pin,
    sync::atomic::{AtomicUsize, Ordering},
    task::{Context, Poll, Waker},
};

use anyhow::Result;
use turbo_tasks::Vc;
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
    let _ = nonce; // ensure the nonce is part of our cache key

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
    let _ = nonce;

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
    let _ = nonce;
    Ok(Value { value: 42 }.cell())
}

#[turbo_tasks::function]
async fn yielding_leaf(nonce: u32) -> Result<Vc<Value>> {
    let _ = nonce;
    tokio::task::yield_now().await;
    Ok(Value { value: 7 }.cell())
}

#[turbo_tasks::function]
async fn identity(input: Vc<Value>) -> Result<Vc<Value>> {
    let value = input.await?.value;
    Ok(Value { value }.cell())
}
