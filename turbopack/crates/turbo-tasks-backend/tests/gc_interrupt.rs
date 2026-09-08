#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Test the interruption mechanisms for GC

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
        !stats.interrupted,
        "the min-progress floor must suppress the interrupt (collected={})",
        stats.collected
    );
    // Generation 0 is fully disconnected by generation 1, and an uninterrupted pass must take all
    // of it: `2 * WIDTH` tasks (an `intermediate` and a `leaf` per index). The live generation and
    // the transient `run_once` roots are not collectible, so this is an exact count, not a floor.
    assert_eq!(
        stats.collected,
        2 * WIDTH as usize,
        "a completing pass must collect the whole disconnected generation: {stats}"
    );

    tt.stop_and_wait().await;
}

/// What an interrupted pass abandons must still be collectible by a later pass.
///
/// The two phases are sequential, not concurrent: nothing here forces a pass to overlap with an
/// operation. Phase 1 relies only on the zero `min_progress` floor, which makes *any* waiter
/// observed by `GcBudget::should_stop` interrupt the pass immediately, so interrupts happen
/// readily across the rounds instead of needing a mid-range floor that might interrupt none of
/// them and assert nothing. Because that is still scheduling-dependent, the loop asserts only
/// that at least one round interrupted — which is the premise phase 2 needs. Phase 2 then runs a
/// deliberately *uninterruptible* pass (`gc_for_testing`) after phase 1 is fully over, and that
/// pass is what must recover everything the interrupted rounds abandoned.
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
        let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
        let stats = outcome.gc_stats();
        println!("round {gen_value}: {stats}");
        collected_while_interrupting += stats.collected;
        interrupted_rounds += usize::from(stats.interrupted);
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

    // Phase 2's pass is uninterruptible and runs once phase 1 is over, so nothing is left for a
    // later pass to pick up: every generation but the live one is garbage, and all of it must be
    // accounted for exactly. An interrupted pass that *lost* garbage rather than leaving it would
    // show up here as a shortfall.
    assert_eq!(
        total_collected, produced,
        "collected {total_collected} of {produced} garbage tasks ({collected_while_interrupting} \
         across {interrupted_rounds} interrupted rounds, {healed} in the completing pass): \
         interrupted passes are losing garbage rather than leaving it"
    );

    tt.stop_and_wait().await;
}
