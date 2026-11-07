#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Tests for [`TurboTasksBackend::snapshot_and_evict`], the explicit snapshot + eviction entry
//! point used by short sessions (e.g. production builds) at phase boundaries.

mod util;

use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::Result;
use turbo_tasks::{GcRoot, OperationVc, ResolvedVc, State, TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, EvictionCounts, StorageMode, TurboTasksBackend, noop_backing_storage,
};

use crate::util::create_tt;

fn total_evicted(counts: &EvictionCounts) -> usize {
    counts.full + counts.data_and_meta + counts.data_only + counts.meta_only
}

/// Evicted tasks are restored from disk and produce the same results.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn snapshot_and_evict_preserves_results() {
    let (tt, _dir) = create_tt("snapshot_and_evict_preserves_results");

    let (state_op, first) = tt
        .run_once(async move {
            let state_op = create_state(10);
            let state_vc = state_op.resolve().strongly_consistent().await?;
            let output = chain(state_vc).read_strongly_consistent().await?;
            Ok((state_op, (output.value, output.random)))
        })
        .await
        .unwrap();
    assert_eq!(first.0, 43);

    let counts = tt
        .backend()
        .snapshot_and_evict(&tt)
        .expect("persisting must succeed")
        .expect("persistence is enabled");
    assert!(
        total_evicted(&counts) > 0,
        "expected some tasks to be evicted, got {counts:?}"
    );

    let second = tt
        .run_once(async move {
            let state_vc = state_op.resolve().strongly_consistent().await?;
            let output = chain(state_vc).read_strongly_consistent().await?;
            Ok((output.value, output.random))
        })
        .await
        .unwrap();
    // Same value and the same `random`: the output was restored, not recomputed.
    assert_eq!(second, first);

    tt.stop_and_wait().await;
}

/// Repeated calls with invalidations in between keep results correct.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn snapshot_and_evict_repeated_with_invalidation() {
    let (tt, _dir) = create_tt("snapshot_and_evict_repeated_with_invalidation");

    let state_op = tt
        .run_once(async move {
            let state_op = create_state(10);
            let state_vc = state_op.resolve().strongly_consistent().await?;
            assert_eq!(chain(state_vc).read_strongly_consistent().await?.value, 43);
            Ok(state_op)
        })
        .await
        .unwrap();

    for (input, expected) in [(20, 73), (0, 13), (5, 28)] {
        let counts = tt
            .backend()
            .snapshot_and_evict(&tt)
            .expect("persisting must succeed")
            .expect("persistence is enabled");
        println!("evicted before setting {input}: {counts:?}");

        let value = tt
            .run_once(async move {
                let state_vc = state_op.resolve().strongly_consistent().await?;
                state_op.read_strongly_consistent().await?.set(input);
                Ok(chain(state_vc).read_strongly_consistent().await?.value)
            })
            .await
            .unwrap();
        assert_eq!(value, expected);
    }

    tt.stop_and_wait().await;
}

/// Without persistence (disabled or read-only) nothing is attempted and nothing is lost.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn snapshot_and_evict_without_persistence() {
    for (storage_mode, name) in [
        (None, "disabled"),
        (Some(StorageMode::ReadOnly), "read-only"),
    ] {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode,
                small_preallocation: true,
                ..Default::default()
            },
            noop_backing_storage(),
        ));

        let state_op = tt
            .run_once(async move {
                let state_op = create_state(10);
                let state_vc = state_op.resolve().strongly_consistent().await?;
                assert_eq!(chain(state_vc).read_strongly_consistent().await?.value, 43);
                Ok(state_op)
            })
            .await
            .unwrap();

        assert!(
            tt.backend()
                .snapshot_and_evict(&tt)
                .expect("nothing is attempted, so nothing can fail")
                .is_none(),
            "{name}"
        );

        let value = tt
            .run_once(async move {
                let state_vc = state_op.resolve().strongly_consistent().await?;
                Ok(chain(state_vc).read_strongly_consistent().await?.value)
            })
            .await
            .unwrap();
        assert_eq!(value, 43);

        tt.stop_and_wait().await;
    }
}

/// Concurrent callers are serialized (each snapshot is followed by its own sweep before another
/// snapshot starts), and results stay correct while tasks execute.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn snapshot_and_evict_concurrent_callers() {
    let (tt, _dir) = create_tt("snapshot_and_evict_concurrent_callers");

    let state_op = tt
        .run_once(async move {
            let state_op = create_state(10);
            let state_vc = state_op.resolve().strongly_consistent().await?;
            assert_eq!(chain(state_vc).read_strongly_consistent().await?.value, 43);
            Ok(state_op)
        })
        .await
        .unwrap();

    let callers = (0..4)
        .map(|_| {
            let tt = tt.clone();
            tokio::task::spawn_blocking(move || {
                for _ in 0..5 {
                    tt.backend()
                        .snapshot_and_evict(&tt)
                        .expect("persisting must succeed")
                        .expect("persistence is enabled");
                }
            })
        })
        .collect::<Vec<_>>();
    for (input, expected) in [(20, 73), (0, 13), (5, 28)] {
        let value = tt
            .run_once(async move {
                let state_vc = state_op.resolve().strongly_consistent().await?;
                state_op.read_strongly_consistent().await?.set(input);
                Ok(chain(state_vc).read_strongly_consistent().await?.value)
            })
            .await
            .unwrap();
        assert_eq!(value, expected);
    }
    for caller in callers {
        caller.await.unwrap();
    }

    tt.stop_and_wait().await;
}

static PINNED_ROOT_EXECUTIONS: AtomicU32 = AtomicU32::new(0);

#[turbo_tasks::function]
fn pinned_leaf(n: u32) -> Vc<u32> {
    Vc::cell(n * 2)
}

#[turbo_tasks::function(operation, root)]
async fn pinned_root(n: u32) -> Result<Vc<u32>> {
    PINNED_ROOT_EXECUTIONS.fetch_add(1, Ordering::Relaxed);
    Ok(Vc::cell(*pinned_leaf(n).await? + 1))
}

/// With GC enabled, an operation pinned across repeated calls (each running a GC pass) is restored
/// from disk afterwards instead of being collected and re-executed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn snapshot_and_evict_keeps_pinned_gc_root() {
    // `create_tt` enables GC.
    let (tt, _dir) = create_tt("snapshot_and_evict_keeps_pinned_gc_root");

    let op: OperationVc<u32> = tt
        .run_once(async move {
            let op = pinned_root(21);
            assert_eq!(*op.read_strongly_consistent().await?, 43);
            Ok(op)
        })
        .await
        .unwrap();
    assert_eq!(PINNED_ROOT_EXECUTIONS.load(Ordering::Relaxed), 1);

    let pin = GcRoot::pin(tt.clone(), op);
    for _ in 0..3 {
        let counts = tt
            .backend()
            .snapshot_and_evict(&tt)
            .expect("persisting must succeed")
            .expect("persistence is enabled");
        println!("evicted: {counts:?}");
    }

    let value = tt
        .run_once(async move { Ok(*op.read_strongly_consistent().await?) })
        .await
        .unwrap();
    assert_eq!(value, 43);
    assert_eq!(
        PINNED_ROOT_EXECUTIONS.load(Ordering::Relaxed),
        1,
        "the pinned root must be restored, not collected and re-executed"
    );
    drop(pin);

    tt.stop_and_wait().await;
}

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state(initial: u32) -> Vc<Step> {
    Step(State::new(initial)).cell()
}

#[turbo_tasks::value]
struct Output {
    value: u32,
    random: u32,
}

#[turbo_tasks::function]
async fn add_one(input: ResolvedVc<Step>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*input.await?.get() + 1))
}

#[turbo_tasks::function]
async fn times_three(input: Vc<u32>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*input.await? * 3))
}

/// `(input + 1) * 3 + 10`, with a random tag that only changes when this task re-executes.
#[turbo_tasks::function(operation, root)]
async fn chain(input: ResolvedVc<Step>) -> Result<Vc<Output>> {
    let value = *times_three(add_one(*input)).await? + 10;
    Ok(Output {
        value,
        random: rand::random(),
    }
    .cell())
}
