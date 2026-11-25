#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{
    sync::atomic::{AtomicU32, Ordering},
    time::Duration,
};

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

static COMPUTE_COUNT: AtomicU32 = AtomicU32::new(0);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn drop_content_hint() {
    // The test counts executions, so it must run only once, on a fresh instance.
    run_once_without_cache_check(&REGISTRATION, async {
        // Initial read computes the value.
        assert_eq!(*read_operation(1).read_strongly_consistent().await?, 42);
        assert_eq!(COMPUTE_COUNT.load(Ordering::SeqCst), 1);

        // Dropping present content doesn't execute the task.
        drop_operation(2).read_strongly_consistent().await?;
        // Dropping content that is not present anymore doesn't recompute it either.
        drop_operation(3).read_strongly_consistent().await?;
        // Give a (wrongly) scheduled recomputation a chance to run.
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(COMPUTE_COUNT.load(Ordering::SeqCst), 1);

        // A later read recomputes the dropped content.
        assert_eq!(*read_operation(4).read_strongly_consistent().await?, 42);
        assert_eq!(COMPUTE_COUNT.load(Ordering::SeqCst), 2);

        // And the content is kept again after that read.
        assert_eq!(*read_operation(5).read_strongly_consistent().await?, 42);
        assert_eq!(COMPUTE_COUNT.load(Ordering::SeqCst), 2);

        // Dropping through a chain of task outputs drops the cell the chain ends in.
        drop_through_output_operation(6)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*read_operation(7).read_strongly_consistent().await?, 42);
        assert_eq!(COMPUTE_COUNT.load(Ordering::SeqCst), 3);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Not serializable, so the content can't be restored from the persistent cache and must be
/// recomputed after it has been dropped.
#[turbo_tasks::value(serialization = "skip")]
struct Content(u32);

#[turbo_tasks::function]
fn compute() -> Vc<Content> {
    COMPUTE_COUNT.fetch_add(1, Ordering::SeqCst);
    Content(42).cell()
}

/// Returns the output of another task, so its own output points to a task output.
#[turbo_tasks::function]
fn forward() -> Vc<Content> {
    compute()
}

/// `nonce` makes every call a new task, so that it actually reads the cell again. (It has to be
/// used, as unused arguments are not part of the task key.)
#[turbo_tasks::function(operation, root)]
async fn read_operation(nonce: u32) -> Result<Vc<u32>> {
    let _ = nonce;
    Ok(Vc::cell(compute().await?.0))
}

#[turbo_tasks::function(operation, root)]
async fn drop_operation(nonce: u32) -> Result<Vc<()>> {
    let _ = nonce;
    compute().drop_content_hint().await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn drop_through_output_operation(nonce: u32) -> Result<Vc<()>> {
    let _ = nonce;
    forward().drop_content_hint().await?;
    Ok(Vc::cell(()))
}
