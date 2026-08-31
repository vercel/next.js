#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

mod util;

use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::util::create_tt;

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

/// A shared-dependency layer, so the disconnected garbage is a subtree (intermediate + leaf) and
/// the test exercises the cascade rather than single-node collection.
#[turbo_tasks::function]
async fn intermediate(generation: u32, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *leaf(generation, index).await?))
}

const WIDTH: u32 = 24;

/// Bumping the generation re-executes this and connects a fresh generation's worth of tasks,
/// disconnecting the entire previous generation (2*WIDTH tasks) as garbage.
#[turbo_tasks::function(operation, root)]
async fn wide_root(generation: ResolvedVc<Generation>) -> Result<Vc<u32>> {
    let generation = *generation.await?.get();
    let mut sum = 0u32;
    for index in 0..WIDTH {
        sum = sum.wrapping_add(*intermediate(generation, index).await?);
    }
    Ok(Vc::cell(sum))
}

/// Repeatedly swapping a wide set of common dependencies (as happens when a project is re-rooted or
/// its dependencies churn) must NOT grow the resident task set monotonically. Each round bumps the
/// generation (disconnecting the previous generation's 2*WIDTH tasks), then snapshots + GCs +
/// evicts, and the resident count must return to a flat baseline.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_re_rooting_stays_flat() {
    let (tt, _persistence_dir) = create_tt("gc_re_rooting_stays_flat");
    let tt2 = tt.clone();

    // This test asserts on *how much* GC collects, so it must not race the interrupt heuristic.
    // `gc_for_testing` already pins the floor for its own pass, but each round also runs
    // `snapshot_and_evict_for_testing`, whose GC pass is fully interruptible: on a loaded machine
    // it can wind down as soon as an operation blocks behind it, collecting less through no fault
    // of GC. Pin the floor beyond any plausible pass so the counts are deterministic; the
    // interrupt path has its own tests.
    tt.backend().set_gc_min_progress_for_testing(u64::MAX / 2);

    const ROUNDS: u32 = 20;

    // Each round runs in its own `run_once` so the root's activeness is released before GC (a
    // `run_once` root keeps everything it touched active until it returns).
    async fn round(
        tt: &Arc<TurboTasks<TurboTasksBackend>>,
        gen_value: u32,
    ) -> (usize, usize, bool) {
        let tt_inner = tt.clone();
        turbo_tasks::run_once(tt.clone(), async move {
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
        // tombstone it.
        let collected = tt.backend().gc_for_testing(tt);
        // This runs a *second*, interruptible GC pass inside `snapshot_and_persist` (unlike
        // `gc_for_testing`, which pins `min_progress` so high it can never trip). On a loaded
        // machine that pass can wind down early, which shows up as a collection shortfall rather
        // than a bug — so report it instead of letting it look like GC failing to collect.
        tt.backend().snapshot_and_evict_for_testing(tt);
        let interrupted = tt
            .backend()
            .last_gc_stats_for_testing()
            .is_some_and(|(_, interrupted)| interrupted);
        // Measure the *persistent* resident count: GC only collects persistent tasks. Transient
        // roots (each round's `run_once`/Once task) are never collected and accumulate
        // independently of GC — including them would mask the real signal.
        (
            collected,
            tt.backend().resident_persistent_task_count_for_testing(),
            interrupted,
        )
    }

    // Warm up: build generation 0, then measure the steady-state baseline after one full cycle.
    let (_, baseline, _) = round(&tt2, 0).await;
    println!("baseline persistent resident after gen 0: {baseline}");

    // Churn: swap the whole dependency set many times.
    let mut max_resident = baseline;
    let mut total_collected = 0usize;
    let mut interrupted_rounds = 0usize;
    for gen_value in 1..=ROUNDS {
        let (collected, resident, interrupted) = round(&tt2, gen_value).await;
        println!(
            "gen {gen_value}: collected={collected} persistent_resident={resident} \
             snapshot_gc_interrupted={interrupted}"
        );
        max_resident = max_resident.max(resident);
        total_collected += collected;
        interrupted_rounds += usize::from(interrupted);
    }

    let no_gc_growth = baseline + (2 * WIDTH as usize) * (ROUNDS as usize);
    println!(
        "baseline={baseline} max_resident={max_resident} total_collected={total_collected} \
         interrupted_rounds={interrupted_rounds} no_gc_growth_would_be={no_gc_growth}"
    );
    // Without GC the persistent resident set would climb by ~2*WIDTH per round (each generation's
    // intermediates + leaves persisted forever), so a bound within a small constant of the baseline
    // is only satisfiable if each generation's garbage subtree is actually collected.
    assert!(
        max_resident <= baseline + 2 * WIDTH as usize,
        "persistent resident set grew too much across re-rooting (max={max_resident}, \
         baseline={baseline}); GC is not returning to a flat baseline"
    );
    // Assert GC collected at least half of a full generation per round (slack for tasks that settle
    // across passes), proving the flat baseline comes from GC collecting garbage — not merely from
    // eviction hiding it on disk.
    let expected_min_collected = (2 * WIDTH as usize) * (ROUNDS as usize) / 2;
    assert!(
        total_collected >= expected_min_collected,
        "GC collected too little ({total_collected}); expected >= {expected_min_collected} across \
         {ROUNDS} re-rootings — GC is not doing the collection. snapshot-pass interrupts: \
         {interrupted_rounds}/{ROUNDS} (a non-zero count means the interruptible pass inside \
         `snapshot_and_persist` wound down early under load, which is a flaky-environment signal \
         rather than a GC defect)"
    );

    // The live graph must still compute correctly after all the churn.
    let tt3 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
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
