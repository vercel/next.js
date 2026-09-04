#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A GC pass holds total operation exclusion, so it winds down early once an operation blocks
//! behind it — but not before `gc_min_progress` has elapsed, so sustained edits can't starve GC.
//!
//! `snapshot_and_evict_for_testing` runs an interruptible pass; `gc_for_testing` forces an
//! uninterruptible one.

mod gc_fixture;
mod util;

use std::{sync::Arc, time::Duration};

use turbo_tasks::TurboTasks;
use turbo_tasks_backend::TurboTasksBackend;

use crate::{
    gc_fixture::{create_generation, wide_root},
    util::create_tt_with_gc_min_progress,
};

/// Wide enough that an interrupted pass leaves an observable shortfall rather than a rounding
/// difference.
const WIDTH: u32 = 400;

/// Builds generation `gen_value`, disconnecting the previous generation's `2 * WIDTH` tasks.
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

/// A waiter blocked for the whole pass must not interrupt it while the floor is unmet.
///
/// The waiter is real rather than simulated: the spawned task takes an operation guard while the
/// GC phase is held, so it parks in `begin_operation`'s cold path.
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

    let (collected, interrupted) = outcome.gc_stats();
    assert!(
        !interrupted,
        "the min-progress floor must suppress the interrupt (collected={collected})"
    );

    tt.stop_and_wait().await;
}

/// What an interrupted pass abandons must still be collectible by a later pass.
///
/// A zero floor interrupts every pass deterministically, rather than a mid-range floor that might
/// interrupt none of them and assert nothing.
///
/// Asserts on GC's own collected counts, not the resident count: eviction moves tasks to disk
/// after every snapshot, so the resident count can't distinguish collected from skipped.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_interrupt_is_self_healing() {
    let (tt, _persistence_dir) =
        create_tt_with_gc_min_progress("gc_interrupt_is_self_healing", Duration::ZERO);

    build_generation(&tt, 0).await;

    // Phase 1: accumulate garbage under passes that keep interrupting.
    const ROUNDS: u32 = 10;
    let mut collected_while_interrupting = 0usize;
    let mut interrupted_rounds = 0usize;
    for gen_value in 1..=ROUNDS {
        build_generation(&tt, gen_value).await;
        let (collected, interrupted) = tt.backend().snapshot_and_evict_for_testing(&tt).gc_stats();
        println!("round {gen_value}: collected={collected} interrupted={interrupted}");
        collected_while_interrupting += collected;
        interrupted_rounds += usize::from(interrupted);
    }

    // The premise of phase 2: without an interrupt, nothing was abandoned to heal from.
    assert!(
        interrupted_rounds > 0,
        "no pass interrupted across {ROUNDS} rounds at a zero floor: nothing was abandoned, so \
         this test proves nothing"
    );

    // Phase 2: a completing pass must recover what was left behind.
    let healed = tt.backend().gc_for_testing(&tt);

    let produced = (2 * WIDTH as usize) * (ROUNDS as usize);
    let total_collected = collected_while_interrupting + healed;
    println!(
        "self-healing: collected_while_interrupting={collected_while_interrupting} \
         healed={healed} total_collected={total_collected} produced={produced} \
         interrupted_rounds={interrupted_rounds}/{ROUNDS}"
    );

    // Every generation but the live one is garbage, so most of it must be accounted for.
    let expected_min = produced / 2;
    assert!(
        total_collected >= expected_min,
        "collected {total_collected} of ~{produced} garbage tasks ({collected_while_interrupting} \
         across {interrupted_rounds} interrupted rounds, {healed} in the completing pass): \
         interrupted passes are losing garbage rather than leaving it"
    );

    tt.stop_and_wait().await;
}
