#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Test the interruption mechanisms for GC

mod gc_fixture;
mod util;

use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use turbo_tasks::TurboTasks;
use turbo_tasks_backend::{TestSnapshotOutcome, TurboTasksBackend};

use crate::{
    gc_fixture::{create_generation, expected_value, generation_task_count, wide_root},
    util::create_tt_with_gc_min_progress,
};

/// Wide enough that an interrupted pass leaves an observable shortfall rather than a rounding
/// difference.
const WIDTH: u32 = 400;

/// Builds generation `gen_value`, disconnecting the previous generation's whole tree.
async fn build_generation(tt: &Arc<TurboTasks<TurboTasksBackend>>, gen_value: u32) {
    turbo_tasks::run_once(tt.clone(), async move {
        let generation_op = create_generation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;
        if gen_value > 0 {
            let generation = generation_op.read_strongly_consistent().await?;
            generation.set(gen_value);
        }
        wide_root(generation_vc, WIDTH)
            .read_strongly_consistent()
            .await?;
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

/// Switches back to generation `gen_value` after later generations were built, returning the
/// value `wide_root` computes for it.
async fn revisit_generation(tt: &Arc<TurboTasks<TurboTasksBackend>>, gen_value: u32) -> u32 {
    turbo_tasks::run_once(tt.clone(), async move {
        let generation_op = create_generation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;
        generation_op
            .read_strongly_consistent()
            .await?
            .set(gen_value);
        Ok(*wide_root(generation_vc, WIDTH)
            .read_strongly_consistent()
            .await?)
    })
    .await
    .unwrap()
}

/// Runs [`TurboTasksBackend::snapshot_and_evict_for_testing`] while a background loop keeps
/// starting operations, so the GC pass sees a waiter and is interrupted once its min-progress floor
/// is met.
async fn snapshot_while_busy(tt: &Arc<TurboTasks<TurboTasksBackend>>) -> TestSnapshotOutcome {
    let stop = Arc::new(AtomicBool::new(false));
    let busy = {
        let tt = tt.clone();
        let stop = stop.clone();
        tokio::spawn(async move {
            while !stop.load(Ordering::Relaxed) {
                turbo_tasks::run_once(tt.clone(), async move {
                    create_generation().read_strongly_consistent().await?;
                    anyhow::Ok(())
                })
                .await
                .unwrap();
            }
        })
    };
    let outcome = tt.backend().snapshot_and_evict_for_testing(tt);
    stop.store(true, Ordering::Relaxed);
    // Wait for the loop to finish its last operation so it cannot interrupt a later pass.
    busy.await.unwrap();
    outcome
}

/// Runs [`TurboTasksBackend::snapshot_and_evict_for_testing`] until its GC pass completes. Work
/// left over from the previous step can still be settling and interrupt the first attempt.
fn snapshot_until_complete(tt: &Arc<TurboTasks<TurboTasksBackend>>) {
    for _ in 0..10 {
        if !tt
            .backend()
            .snapshot_and_evict_for_testing(tt)
            .gc_interrupted()
        {
            return;
        }
    }
    panic!("no GC pass completed in 10 attempts");
}

/// A waiter blocked for the whole pass must not interrupt it while the floor is unmet.
///
/// This *provokes* the interleaving rather than forcing it: the spawned operation may park on the
/// exclusion while the pass is running, or it may not be scheduled until the pass is already over,
/// in which case `operations_waiting()` is never true and there was no interrupt to suppress.
/// Forcing it would mean reaching into the coordinator from the test, which is a bigger intrusion
/// than the coverage is worth. Both interleavings must produce a completing pass, so the
/// assertions below hold either way — the floor is what makes the outcome independent of the
/// scheduling.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_min_progress_floor_beats_a_waiting_operation() {
    // A floor far longer than the pass: the interrupt must never be honoured.
    let (tt, _persistence_dir) =
        create_tt_with_gc_min_progress("gc_min_progress_floor", Duration::from_secs(60));

    build_generation(&tt, 0).await;
    build_generation(&tt, 1).await;

    let tt_waiter = tt.clone();
    let waiter = tokio::spawn(async move {
        turbo_tasks::run_once(tt_waiter.clone(), async move {
            let generation_op = create_generation();
            let generation_vc = generation_op.resolve().strongly_consistent().await?;
            wide_root(generation_vc, WIDTH)
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    });

    let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
    waiter.await.unwrap();

    let stats = outcome.gc_stats();
    assert!(
        !outcome.gc_interrupted(),
        "the min-progress floor must suppress the interrupt (collected={})",
        stats.collected
    );
    // Generation 0 is fully disconnected by generation 1, and an uninterrupted pass must take all
    // of it: every `subtree` node plus every `leaf`. The live generation and the transient
    // `run_once` roots are not collectible, so this is an exact count, not a floor.
    assert_eq!(
        stats.collected,
        generation_task_count(WIDTH),
        "a completing pass must collect the whole disconnected generation: {stats}"
    );

    tt.stop_and_wait().await;
}

/// Garbage an interrupted pass abandons must still be collectible by a later pass.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_interrupt_is_self_healing() {
    // A floor short enough that passes still interrupt readily, but long enough that each one
    // collects something first. At a zero floor `should_stop` trips on the very first job, before
    // any shard is scanned, so rounds routinely collect nothing and phase 2 does all the work.
    //
    let (tt, _persistence_dir) =
        create_tt_with_gc_min_progress("gc_interrupt_is_self_healing", Duration::from_micros(100));

    build_generation(&tt, 0).await;

    // Phase 1: accumulate garbage under passes that interrupt as the scheduler allows.
    const ROUNDS: u32 = 10;
    let mut collected_in_phase_1 = 0usize;
    let mut interrupted_rounds = 0usize;
    for gen_value in 1..=ROUNDS {
        build_generation(&tt, gen_value).await;
        let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
        let stats = outcome.gc_stats();
        // Reported, never asserted on: when the totals below disagree, the per-round split is the
        // first thing worth seeing.
        println!("round {gen_value}: {stats}");
        collected_in_phase_1 += stats.collected;
        interrupted_rounds += usize::from(outcome.gc_interrupted());
    }

    // Phase 2: a completing pass must recover exactly what phase 1 left behind.
    let healed = tt.backend().gc_for_testing(&tt);

    let produced = generation_task_count(WIDTH) * (ROUNDS as usize);
    let total_collected = collected_in_phase_1 + healed;
    println!(
        "self-healing: collected_in_phase_1={collected_in_phase_1} healed={healed} \
         total_collected={total_collected} produced={produced} \
         interrupted_rounds={interrupted_rounds}/{ROUNDS}"
    );

    // Phase 2's pass is uninterruptible and runs once phase 1 is over, so nothing is left for a
    // later pass to pick up: every generation but the live one is garbage, and all of it must be
    // accounted for exactly. An interrupted pass that *lost* garbage rather than leaving it would
    // show up here as a shortfall.
    assert_eq!(
        total_collected, produced,
        "collected {total_collected} of {produced} garbage tasks ({collected_in_phase_1} in phase \
         1 across {interrupted_rounds}/{ROUNDS} interrupted rounds, {healed} in the completing \
         pass): interrupted passes are losing garbage rather than leaving it"
    );

    tt.stop_and_wait().await;
}

/// Tasks an interrupted pass collected must stay resident until a snapshot tombstones them.
///
/// An interrupted pass abandons the snapshot that would have written its tombstones, but it has
/// already torn down the collected tasks' edges in their neighbours, and the next snapshot
/// persists those neighbours. If eviction drops the collected tasks anyway, their last snapshot is
/// still live on disk. Revisiting an old generation then restores them as live tasks whose
/// children may since have been collected and tombstoned, and touching those children panics with
/// `task is missing in memory or persistent storage`.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_interrupted_pass_keeps_collected_tasks_until_tombstoned() {
    let (tt, _persistence_dir) = create_tt_with_gc_min_progress(
        "gc_interrupted_pass_keeps_collected_tasks_until_tombstoned",
        Duration::from_micros(100),
    );

    // Each round persists a generation with a completing snapshot, disconnects it by building the
    // next one, then snapshots again while operations keep arriving so the pass is interrupted
    // after collecting part of that persisted garbage. Only previously persisted tasks can be left
    // stale on disk; a never-persisted task has nothing on disk to restore.
    const ROUNDS: u32 = 5;
    let mut gen_value = 0;
    let mut interrupted_collections = 0usize;
    for round in 1..=ROUNDS {
        build_generation(&tt, gen_value).await;
        snapshot_until_complete(&tt);

        gen_value += 1;
        build_generation(&tt, gen_value).await;
        let outcome = snapshot_while_busy(&tt).await;
        let stats = outcome.gc_stats();
        println!(
            "round {round}: interrupted={} {stats}",
            outcome.gc_interrupted()
        );
        if outcome.gc_interrupted() && stats.collected > 0 {
            interrupted_collections += 1;
        }
    }
    assert!(
        interrupted_collections > 0,
        "no interrupted pass collected anything in {ROUNDS} rounds, so this test proved nothing"
    );

    // A completing pass's snapshot tombstones whatever the interrupted passes left pending.
    snapshot_until_complete(&tt);

    // Revisit every generation, collecting the one we leave each time. A stale task restored from
    // disk is reconnected here, and collecting it again walks its dangling child edges.
    for gen_value in 0..=gen_value {
        assert_eq!(
            revisit_generation(&tt, gen_value).await,
            expected_value(gen_value, WIDTH),
            "generation {gen_value} computed the wrong value"
        );
        tt.backend().gc_for_testing(&tt);
        tt.backend().snapshot_and_evict_for_testing(&tt);
    }

    tt.stop_and_wait().await;
}
