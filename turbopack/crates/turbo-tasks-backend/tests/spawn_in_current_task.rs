#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Cell reads in futures spawned with `spawn_in_current_task` add their dependencies to the
//! spawning task in one batch when the future finishes. These tests check that no invalidation is
//! lost: neither after the batch was added, nor while it is still pending.

use std::{
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use tokio::sync::Notify;
use turbo_tasks::{ReadRef, ResolvedVc, State, TryJoinIterExt, Vc, spawn_in_current_task};
use turbo_tasks_testing::{Registration, register, run_once, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::function]
async fn value_of(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*input.await?.state.get()))
}

/// Sums the inputs, reading the `value_of` cells in spawned futures.
#[turbo_tasks::function(operation, root)]
async fn sum_operation(inputs: Vec<ResolvedVc<ChangingInput>>) -> Result<Vc<u32>> {
    let cells = inputs
        .iter()
        .map(|input| value_of(**input).to_resolved())
        .try_join()
        .await?;
    let handles = cells
        .chunks(2)
        .map(|chunk| {
            let chunk = chunk.to_vec();
            spawn_in_current_task(async move {
                let mut sum = 0;
                for cell in chunk {
                    sum += *cell.await?;
                }
                anyhow::Ok(sum)
            })
        })
        .collect::<Vec<_>>();
    let mut sum = 0;
    for handle in handles {
        sum += handle.await?;
    }
    Ok(Vc::cell(sum))
}

fn new_inputs(count: u32) -> (Vec<ReadRef<ChangingInput>>, Vec<ResolvedVc<ChangingInput>>) {
    let values = (0..count)
        .map(|i| {
            ReadRef::new_owned(ChangingInput {
                state: State::new(i),
            })
        })
        .collect::<Vec<_>>();
    let vcs = values
        .iter()
        .map(|value| ReadRef::resolved_cell(value.clone()))
        .collect();
    (values, vcs)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn invalidates_after_deferred_dependencies_are_added() {
    run_once(&REGISTRATION, async || {
        let (values, vcs) = new_inputs(8);
        let op = sum_operation(vcs);
        assert_eq!(*op.read_strongly_consistent().await?, 28);

        // Each change must re-execute the sum. The second change of the same input is read in an
        // execution where the dependency is outdated (from the previous execution).
        for (index, value, expected) in [(0, 10, 38), (5, 0, 33), (0, 1, 24), (7, 7, 24)] {
            values[index].state.set(value);
            assert_eq!(*op.read_strongly_consistent().await?, expected);
        }
        Ok(())
    })
    .await
    .unwrap()
}

/// Set while the first execution of `slow_read_operation` should wait in its spawned future.
static HOLD: AtomicBool = AtomicBool::new(true);
static READ_DONE: Notify = Notify::const_new();
static CHANGED: Notify = Notify::const_new();
static EXECUTIONS: Mutex<Vec<u32>> = Mutex::new(Vec::new());

/// Reads the cell in a spawned future, which then waits until the cell changed, before its
/// deferred dependency is added.
#[turbo_tasks::function(operation, root)]
async fn slow_read_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    let cell = value_of(*input).to_resolved().await?;
    let value = spawn_in_current_task(async move {
        let value = *cell.await?;
        if HOLD.swap(false, Ordering::SeqCst) {
            READ_DONE.notify_one();
            CHANGED.notified().await;
            // INVALIDATION: untracked, as this only waits for the change. The cell's new content
            // is only set after its dependents were invalidated, so once it's visible, this
            // execution has been invalidated, while its dependency is still deferred.
            while *cell.untracked().await? == value {
                tokio::task::yield_now().await;
            }
        }
        anyhow::Ok(value)
    })
    .await?;
    EXECUTIONS.lock().unwrap().push(value);
    Ok(Vc::cell(value))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn invalidates_while_deferred_dependencies_are_pending() {
    // Runs only once: the test coordinates with the execution through statics.
    run_once_without_cache_check(&REGISTRATION, async {
        let (values, vcs) = new_inputs(1);
        let op = slow_read_operation(vcs[0]);
        let change = turbo_tasks::spawn(async move {
            READ_DONE.notified().await;
            values[0].state.set(42);
            CHANGED.notify_one();
        });
        let read = *op.read_strongly_consistent().await?;
        change.await;

        // The first execution returns the old value, but was invalidated while its dependency was
        // pending, so it must be re-executed.
        assert_eq!(read, 42);
        assert_eq!(*EXECUTIONS.lock().unwrap(), [0, 42]);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Reads the cell twice in a spawned future, so the second deferred read finds the reverse edge
/// already there.
#[turbo_tasks::function]
async fn deferred_reader(input: ResolvedVc<ChangingInput>, offset: u32) -> Result<Vc<u32>> {
    let cell = value_of(*input).to_resolved().await?;
    let value = spawn_in_current_task(async move {
        let first = *cell.await?;
        let second = *cell.await?;
        assert_eq!(first, second);
        anyhow::Ok(first + offset)
    })
    .await?;
    Ok(Vc::cell(value))
}

/// More readers of one cell than an `EdgeSet` keeps as a scanned array, so the deferred reads
/// switch its dependents to a hash table.
const MANY_READERS: u32 = 64;

#[turbo_tasks::function(operation, root)]
async fn many_readers_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    let values = (0..MANY_READERS)
        .map(|offset| deferred_reader(*input, offset))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|value| **value).sum()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn invalidates_many_deferred_readers_of_one_cell() {
    run_once(&REGISTRATION, async || {
        let (values, vcs) = new_inputs(2);
        let op = many_readers_operation(vcs[1]);
        let offsets: u32 = (0..MANY_READERS).sum();
        // Every reader must be re-executed on each change, including the second one, which reads
        // edges that are outdated from the previous execution.
        assert_eq!(
            *op.read_strongly_consistent().await?,
            MANY_READERS + offsets
        );
        values[1].state.set(10);
        assert_eq!(
            *op.read_strongly_consistent().await?,
            10 * MANY_READERS + offsets
        );
        values[1].state.set(3);
        assert_eq!(
            *op.read_strongly_consistent().await?,
            3 * MANY_READERS + offsets
        );
        Ok(())
    })
    .await
    .unwrap()
}

static MIXED_READ_DONE: Notify = Notify::const_new();
static MIXED_DIRECT_READ_DONE: Notify = Notify::const_new();

/// Reads the cell with a normal read while a spawned future's deferred read of it is still
/// pending, so the reverse edge already exists without the forward edge.
#[turbo_tasks::function(operation, root)]
async fn mixed_reads_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    let cell = value_of(*input).to_resolved().await?;
    let handle = spawn_in_current_task(async move {
        let value = *cell.await?;
        MIXED_READ_DONE.notify_one();
        // With a timeout, so that a failing direct read (e.g. a panic) fails the test instead of
        // hanging it.
        let _ =
            tokio::time::timeout(Duration::from_secs(10), MIXED_DIRECT_READ_DONE.notified()).await;
        anyhow::Ok(value)
    });
    MIXED_READ_DONE.notified().await;
    let direct = *cell.await?;
    MIXED_DIRECT_READ_DONE.notify_one();
    let deferred = handle.await?;
    assert_eq!(direct, deferred);
    Ok(Vc::cell(direct))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn normal_read_while_deferred_read_is_pending() {
    // Runs only once: the test coordinates with the execution through statics.
    run_once_without_cache_check(&REGISTRATION, async {
        let (values, vcs) = new_inputs(2);
        let op = mixed_reads_operation(vcs[1]);
        assert_eq!(*op.read_strongly_consistent().await?, 1);
        values[1].state.set(10);
        assert_eq!(*op.read_strongly_consistent().await?, 10);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
