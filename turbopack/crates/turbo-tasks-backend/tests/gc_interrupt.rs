#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A GC pass holds total operation exclusion, so every invalidation blocks for its whole duration —
//! in dev that is an HMR edit stalled behind the cascade. The pass therefore watches the
//! coordinator's waiter count and winds down early once someone is blocked, but not before a
//! min-progress floor has elapsed (so sustained edits can't starve GC entirely).
//!
//! These tests drive that machinery through `snapshot_and_evict_for_testing`, which runs a real
//! production-shaped pass (`begin_gc` -> `gc_collect` -> `into_snapshot`). `gc_for_testing` is
//! deliberately *not* used here: it forces an uninterruptible pass, because the exact-count
//! regression tests depend on a full pass.

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
            // Force GC on so `snapshot_and_evict_for_testing` runs a real pass.
            gc: Some(true),
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

#[turbo_tasks::function]
fn leaf(generation: u32, index: u32) -> Vc<u32> {
    Vc::cell(generation.wrapping_mul(1000).wrapping_add(index))
}

#[turbo_tasks::function]
async fn intermediate(generation: u32, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *leaf(generation, index).await?))
}

/// Wide enough that a pass has many jobs to abandon, so an interrupt is observable as a shortfall
/// rather than lost in rounding.
const WIDTH: u32 = 400;

/// Reads `WIDTH` intermediates (each reading a leaf). Bumping the generation disconnects the whole
/// previous generation — `2 * WIDTH` tasks of garbage in one shot.
#[turbo_tasks::function(operation, root)]
async fn wide_root(generation: ResolvedVc<Generation>) -> Result<Vc<u32>> {
    let generation = *generation.await?.get();
    let mut sum = 0u32;
    for index in 0..WIDTH {
        sum = sum.wrapping_add(*intermediate(generation, index).await?);
    }
    Ok(Vc::cell(sum))
}

/// Builds generation `gen_value`, disconnecting the previous generation's `2 * WIDTH` tasks.
async fn build_generation(tt: &Arc<TurboTasks<TurboTasksBackend>>, gen_value: u32) {
    turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let generation_op = create_generation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;
        if gen_value > 0 {
            let generation = generation_op.read_strongly_consistent().await?;
            generation.set(gen_value);
        }
        wide_root(generation_vc).read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

/// A pass with the floor at 0 and nothing contending must **not** interrupt: the budget's trigger
/// is real contention, not merely being interruptible. This is the control for the tests below —
/// without it, "interrupted" could just mean "the budget fires unconditionally".
///
/// "Nothing contending" can't be *guaranteed* from the outside: the backend may take an operation
/// guard for its own background work at any moment (a genuine waiter, correctly reported), and at a
/// zero floor even one such arrival trips the budget. That is the mechanism working, not a bug —
/// but it makes a single observation unreliable. So this runs several rounds and requires that at
/// least one completes uninterrupted; an unconditional trip could never produce that.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_does_not_interrupt_without_a_waiter() {
    let (tt, _persistence_dir) = create_tt("gc_no_interrupt_without_waiter");

    // Interruptible from the first job — but nothing of ours is waiting.
    tt.backend().set_gc_min_progress_for_testing(0);

    const ROUNDS: u32 = 5;
    let mut saw_uninterrupted = false;
    for gen_value in 0..ROUNDS {
        build_generation(&tt, gen_value).await;
        tt.backend().snapshot_and_evict_for_testing(&tt);

        let (collected, abandoned, interrupted) = tt
            .backend()
            .last_gc_stats_for_testing()
            .expect("a GC pass should have run");
        println!(
            "no-waiter round {gen_value}: collected={collected} abandoned={abandoned} \
             interrupted={interrupted}"
        );
        if !interrupted {
            assert_eq!(
                abandoned, 0,
                "an uninterrupted pass must abandon nothing (round {gen_value})"
            );
            saw_uninterrupted = true;
        }
    }

    assert!(
        saw_uninterrupted,
        "every one of {ROUNDS} passes interrupted despite nothing of ours waiting — the budget is \
         tripping unconditionally rather than on real contention"
    );

    tt.stop_and_wait().await;
}

/// With the floor at its default and an operation blocked on the exclusion for the whole pass, the
/// floor must win: the pass runs to completion rather than bailing at job zero. This is what stops
/// a dev server under sustained edits from starving GC entirely.
///
/// The waiter is real, not simulated: a background task takes an operation guard while the GC phase
/// is held, so it parks in `begin_operation`'s cold path — exactly what an HMR edit arriving
/// mid-pass does.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_min_progress_floor_beats_a_waiting_operation() {
    let (tt, _persistence_dir) = create_tt("gc_min_progress_floor");

    build_generation(&tt, 0).await;
    build_generation(&tt, 1).await;

    // A floor far longer than the pass: the interrupt must never be honoured.
    tt.backend().set_gc_min_progress_for_testing(60_000);

    let tt_waiter = tt.clone();
    let waiter = tokio::spawn(async move {
        turbo_tasks::run_once(tt_waiter.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let generation_op = create_generation();
            let generation_vc = generation_op.resolve().strongly_consistent().await?;
            wide_root(generation_vc).read_strongly_consistent().await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    });

    tt.backend().snapshot_and_evict_for_testing(&tt);
    waiter.await.unwrap();

    let (collected, abandoned, interrupted) = tt
        .backend()
        .last_gc_stats_for_testing()
        .expect("a GC pass should have run");
    println!("floor: collected={collected} abandoned={abandoned} interrupted={interrupted}");
    assert!(
        !interrupted,
        "the min-progress floor must suppress the interrupt (collected={collected}, \
         abandoned={abandoned})"
    );
    assert_eq!(
        abandoned, 0,
        "a pass held by the floor abandons nothing, even with an operation waiting"
    );

    tt.stop_and_wait().await;
}

/// An interrupted pass must be *self-healing*: whatever it abandons is re-derived and collected by
/// a later pass, so garbage is never lost permanently. This is the property that makes abandoning
/// work safe, and it holds regardless of whether any particular pass actually interrupted.
///
/// Asserted on GC's **own** collected counts, not the resident task count. Eviction moves tasks to
/// disk after every snapshot, so the resident count falls to near zero whether GC collected the
/// garbage or merely skipped it — it cannot tell the two apart, which is exactly the distinction
/// this test exists to make.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_interrupt_is_self_healing() {
    let (tt, _persistence_dir) = create_tt("gc_interrupt_is_self_healing");

    // Interruptible from the first job for the whole test, so passes are free to abandon work.
    tt.backend().set_gc_min_progress_for_testing(0);

    build_generation(&tt, 0).await;

    const ROUNDS: u32 = 10;
    let mut total_collected = 0usize;
    let mut interrupted_rounds = 0usize;
    for gen_value in 1..=ROUNDS {
        // Each round disconnects the previous generation: 2*WIDTH tasks of fresh garbage.
        build_generation(&tt, gen_value).await;
        tt.backend().snapshot_and_evict_for_testing(&tt);
        let (collected, abandoned, interrupted) = tt
            .backend()
            .last_gc_stats_for_testing()
            .expect("a GC pass should have run");
        println!(
            "round {gen_value}: collected={collected} abandoned={abandoned} \
             interrupted={interrupted}"
        );
        total_collected += collected;
        if interrupted {
            interrupted_rounds += 1;
        }
    }

    // Each round produces 2*WIDTH garbage tasks, so ROUNDS rounds produce 2*WIDTH*ROUNDS. GC must
    // have collected the bulk of that: an interrupted pass leaves work for the next one, but across
    // ROUNDS rounds the totals have to add up. If interruption lost garbage permanently, this would
    // fall short by roughly the amount abandoned.
    let produced = (2 * WIDTH as usize) * (ROUNDS as usize);
    let expected_min = produced / 2;
    println!(
        "self-healing: total_collected={total_collected} produced={produced} \
         expected_min={expected_min} interrupted_rounds={interrupted_rounds}/{ROUNDS}"
    );
    assert!(
        total_collected >= expected_min,
        "GC collected only {total_collected} of ~{produced} garbage tasks across {ROUNDS} rounds \
         ({interrupted_rounds} interrupted); interrupted passes are losing garbage instead of \
         leaving it for the next pass"
    );

    tt.stop_and_wait().await;
}
