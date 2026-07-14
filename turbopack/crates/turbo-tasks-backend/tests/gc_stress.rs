#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, State, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, EvictionMode, GitVersionInfo, TurboTasksBackend};

fn create_test_persistence_dir(name: &str) -> tempfile::TempDir {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    tempfile::Builder::new()
        .prefix(&format!("{name}-"))
        .tempdir_in(&parent)
        .unwrap()
}

fn create_tt(name: &str) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let dir = create_test_persistence_dir(name);
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(2),
            small_preallocation: true,
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            dir.path(),
            &GitVersionInfo {
                describe: "test-unversioned",
                dirty: false,
            },
            false,
            true,
            true,
        )
        .unwrap()
        .0,
    ));
    (tt, dir)
}

#[turbo_tasks::value(transparent)]
struct Generation(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_generation() -> Vc<Generation> {
    Generation(State::new(0)).cell()
}

/// A leaf keyed by (generation, index). Bumping the generation makes `wide_root` read an entirely
/// fresh set of these, disconnecting the whole previous generation.
#[turbo_tasks::function]
fn leaf(generation: u32, index: u32) -> Vc<u32> {
    Vc::cell(generation.wrapping_mul(1000).wrapping_add(index))
}

/// An intermediate that reads one leaf — a shared-dependency layer so the disconnected garbage is a
/// subtree (intermediate + leaf), exercising the cascade rather than single-node collection.
#[turbo_tasks::function]
async fn intermediate(generation: u32, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *leaf(generation, index).await?))
}

const WIDTH: u32 = 24;

/// Reads WIDTH intermediates (each reading a leaf) for the current generation. Bumping the
/// generation re-executes this and connects a fresh generation's worth of tasks, disconnecting the
/// entire previous generation (2*WIDTH tasks) as garbage.
#[turbo_tasks::function(operation, root)]
async fn wide_root(generation: ResolvedVc<Generation>) -> Result<Vc<u32>> {
    let generation = *generation.await?.get();
    let mut sum = 0u32;
    for index in 0..WIDTH {
        sum = sum.wrapping_add(*intermediate(generation, index).await?);
    }
    Ok(Vc::cell(sum))
}

/// The pathology this whole effort targets: repeatedly swapping a wide set of common dependencies
/// (as happens when a project is re-rooted or its dependencies churn) must NOT grow the resident
/// task set monotonically. Each round bumps the generation (disconnecting the previous generation's
/// 2*WIDTH tasks), then snapshots + GCs + evicts. The resident count must return to a flat baseline
/// each round rather than climbing with the number of rounds.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_re_rooting_stays_flat() {
    let (tt, _persistence_dir) = create_tt("gc_re_rooting_stays_flat");
    let tt2 = tt.clone();

    const ROUNDS: u32 = 20;

    // Each round runs in its own `run_once` so the root's activeness is released before GC (a
    // `run_once` root keeps everything it touched active until it returns). Returns the resident
    // count measured after that round's snapshot + GC + evict.
    async fn round(tt: &Arc<TurboTasks<TurboTasksBackend>>, gen_value: u32) -> (usize, usize) {
        let tt_inner = tt.clone();
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            // `create_generation` is a cached root operation, so this returns the same task each
            // round.
            let generation_op = create_generation();
            let generation_vc = generation_op.resolve().strongly_consistent().await?;
            if gen_value > 0 {
                let generation = generation_op.read_strongly_consistent().await?;
                generation.set(gen_value);
            }
            let output = wide_root(generation_vc);
            output.read_strongly_consistent().await?;
            let _ = &tt_inner;
            anyhow::Ok(())
        })
        .await
        .unwrap();

        // GC runs BEFORE eviction (matching the production background cycle: snapshot -> GC ->
        // evict), so the disconnected garbage is still resident when GC scans it. Running eviction
        // first would drop the garbage to disk-only where the in-memory GC can't collect or
        // tombstone it. Return the number GC collected this round alongside the resident count.
        let collected = tt.backend().gc_for_testing(tt);
        tt.backend().snapshot_and_evict_for_testing(tt);
        // Measure the *persistent* resident count: GC only collects persistent tasks. Transient
        // roots (each round's `run_once`/Once task) are never collected and accumulate
        // independently of GC — including them would mask the real signal.
        (
            collected,
            tt.backend().resident_persistent_task_count_for_testing(),
        )
    }

    // Warm up: build generation 0, then measure the steady-state baseline after one full cycle.
    let (_, baseline) = round(&tt2, 0).await;
    println!("baseline persistent resident after gen 0: {baseline}");

    // Churn: swap the whole dependency set many times. Track the max resident count and the total
    // collected, so we assert both that memory stays flat AND that GC (not just eviction) is
    // actually doing the collecting.
    let mut max_resident = baseline;
    let mut total_collected = 0usize;
    for gen_value in 1..=ROUNDS {
        let (collected, resident) = round(&tt2, gen_value).await;
        println!("gen {gen_value}: collected={collected} persistent_resident={resident}");
        max_resident = max_resident.max(resident);
        total_collected += collected;
    }

    let no_gc_growth = baseline + (2 * WIDTH as usize) * (ROUNDS as usize);
    println!(
        "baseline={baseline} max_resident={max_resident} total_collected={total_collected} \
         no_gc_growth_would_be={no_gc_growth}"
    );
    // Flat-baseline assertion on the PERSISTENT resident set: without GC it would climb by ~2*WIDTH
    // per round (each generation's intermediates + leaves persisted forever). With GC each
    // generation's garbage subtree is collected, so the persistent set stays within a small
    // constant of the baseline regardless of the number of rounds.
    assert!(
        max_resident <= baseline + 2 * WIDTH as usize,
        "persistent resident set grew too much across re-rooting (max={max_resident}, \
         baseline={baseline}); GC is not returning to a flat baseline"
    );
    // GC must be doing the work: each round disconnects a full generation (2*WIDTH tasks), so over
    // ROUNDS rounds GC should have collected on the order of 2*WIDTH*ROUNDS tasks. Assert it
    // collected at least most of that (allowing slack for tasks that settle across passes), proving
    // the flat baseline is due to GC collecting garbage — not merely eviction hiding it on disk.
    let expected_min_collected = (2 * WIDTH as usize) * (ROUNDS as usize) / 2;
    assert!(
        total_collected >= expected_min_collected,
        "GC collected too little ({total_collected}); expected >= {expected_min_collected} across \
         {ROUNDS} re-rootings — GC is not doing the collection"
    );

    // The live graph must still compute correctly after all the churn.
    let tt3 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let generation_op = create_generation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;
        let output = wide_root(generation_vc);
        // generation is ROUNDS; sum = WIDTH intermediates each = 1 + leaf(ROUNDS, i).
        let expected: u32 = (0..WIDTH)
            .map(|i| 1 + (ROUNDS.wrapping_mul(1000).wrapping_add(i)))
            .fold(0u32, |a, b| a.wrapping_add(b));
        assert_eq!(*output.read_strongly_consistent().await?, expected);
        let _ = &tt3;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    tt.stop_and_wait().await;
}

const FANOUT: u32 = 5000;

/// A root that reads `FANOUT` leaves *directly*, so it accumulates ~`FANOUT` children in one task
/// (and, via reading each leaf's cell, a large forward-dependency set). Keyed by generation so
/// bumping it disconnects the entire previous fan-out at once.
#[turbo_tasks::function(operation, root)]
async fn huge_root(generation: ResolvedVc<Generation>) -> Result<Vc<u32>> {
    let generation = *generation.await?.get();
    let mut sum = 0u32;
    for index in 0..FANOUT {
        sum = sum.wrapping_add(*leaf(generation, index).await?);
    }
    Ok(Vc::cell(sum))
}

/// Exercises the *per-task* fan-out of the parallel collector (the chunked `Decrement`/`Scrub*`
/// jobs): a single collected task has thousands of children and forward dependencies, which must be
/// torn down across worker threads in bounded chunks rather than by one serial job. Collecting the
/// disconnected generation's `huge_root` (≈FANOUT children) + its FANOUT leaves must fully reclaim
/// the subtree, and the graph must still recompute afterwards.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_collects_wide_fanout_task() {
    let (tt, _persistence_dir) = create_tt("gc_collects_wide_fanout_task");
    let tt2 = tt.clone();

    // Build generation 0 (huge_root + FANOUT leaves), then flip to generation 1 which disconnects
    // the entire generation-0 fan-out.
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let generation_op = create_generation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;
        let generation = generation_op.read_strongly_consistent().await?;

        let output = huge_root(generation_vc);
        output.read_strongly_consistent().await?;

        // Disconnect the whole generation-0 fan-out in one shot.
        generation.set(1);
        output.read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // Baseline after building + reading generation 1 (once, to settle), then collect the
    // disconnected generation-0 subtree.
    let baseline = tt2.backend().resident_persistent_task_count_for_testing();
    let collected = tt2.backend().gc_for_testing(&tt2);
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let after = tt2.backend().resident_persistent_task_count_for_testing();

    println!(
        "wide-fanout: baseline={baseline} collected={collected} after={after} (fanout={FANOUT})"
    );
    // Collecting one wide-fanout generation tears down ~FANOUT+1 tasks (huge_root + its leaves)
    // spread across worker threads via the chunked jobs. Assert the pass collected the bulk of a
    // full generation (allowing slack for tasks that settle across passes), proving the per-task
    // fan-out actually reclaims the whole subtree rather than pinning/starving.
    assert!(
        collected >= (FANOUT as usize) / 2,
        "wide-fanout GC collected too little ({collected}); expected >= {} — per-task fan-out is \
         not tearing down the whole subtree",
        FANOUT / 2
    );

    // The live graph must still compute correctly after the wide teardown.
    let tt3 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let generation_op = create_generation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;
        let output = huge_root(generation_vc);
        // generation is 1; sum = sum of leaf(1, i) for i in 0..FANOUT.
        let expected: u32 = (0..FANOUT)
            .map(|i| 1u32.wrapping_mul(1000).wrapping_add(i))
            .fold(0u32, |a, b| a.wrapping_add(b));
        assert_eq!(*output.read_strongly_consistent().await?, expected);
        let _ = &tt3;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    tt.stop_and_wait().await;
}
