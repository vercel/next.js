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

use std::{sync::Arc, time::Duration};

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, State, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, EvictionMode, GitVersionInfo, TurboTasksBackend,
};

fn create_test_persistence_dir(name: &str) -> tempfile::TempDir {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    tempfile::Builder::new()
        .prefix(&format!("{name}-"))
        .tempdir_in(&parent)
        .unwrap()
}

fn create_tt(
    name: &str,
    gc_min_progress: Duration,
) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let dir = create_test_persistence_dir(name);
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(2),
            small_preallocation: true,
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            // Force GC on so `snapshot_and_evict_for_testing` runs a real pass.
            gc: Some(true),
            gc_min_progress: Some(gc_min_progress),
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            dir.path(),
            &GitVersionInfo {
                describe: "test-unversioned",
                dirty: false,
            },
            BackingStorageOptions {
                is_short_session: true,
                skip_compaction: true,
                ..Default::default()
            },
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

/// An interruptible pass that is not actually blocking anyone must **not** interrupt: the budget's
/// trigger is real contention, not merely being interruptible. This is the control for the tests
/// below — without it, "interrupted" could just mean "the budget fires unconditionally".
///
/// The floor is deliberately non-zero, because "nothing contending" cannot be arranged from the
/// outside. The backend takes operation guards for its own background work, and one that is
/// mid-flight when the exclusion begins suspends to let it start — a real waiter, visible from the
/// pass's first poll (see `SnapshotCoordinator::waiting_operations`). At a zero floor that alone
/// trips the budget every time, which is the mechanism working correctly but leaves no room to
/// observe an *uninterrupted* pass. A short floor lets a quiet pass finish while still being far
/// too small to mask a budget that fires unconditionally.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_does_not_interrupt_without_a_waiter() {
    let (tt, _persistence_dir) =
        create_tt("gc_no_interrupt_without_waiter", Duration::from_secs(5));

    const ROUNDS: u32 = 5;
    let mut saw_uninterrupted = false;
    for gen_value in 0..ROUNDS {
        build_generation(&tt, gen_value).await;
        tt.backend().snapshot_and_evict_for_testing(&tt);

        let (collected, interrupted) = tt
            .backend()
            .last_gc_stats_for_testing()
            .expect("a GC pass should have run");
        println!("no-waiter round {gen_value}: collected={collected} interrupted={interrupted}");
        if !interrupted {
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
    // A floor far longer than the pass: the interrupt must never be honoured.
    let (tt, _persistence_dir) = create_tt("gc_min_progress_floor", Duration::from_secs(60));

    build_generation(&tt, 0).await;
    build_generation(&tt, 1).await;

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

    let (collected, interrupted) = tt
        .backend()
        .last_gc_stats_for_testing()
        .expect("a GC pass should have run");
    println!("floor: collected={collected} interrupted={interrupted}");
    assert!(
        !interrupted,
        "the min-progress floor must suppress the interrupt (collected={collected})"
    );

    tt.stop_and_wait().await;
}

/// An interrupted pass must be *self-healing*: whatever it abandons is re-derived and collected by
/// a later pass, so garbage is never lost permanently. This is the property that makes abandoning
/// work safe.
///
/// Structured in two phases so that both halves are actually observed rather than assumed. A
/// floor tuned to interrupt *sometimes* would be timing-dependent and could silently degrade into
/// either "never interrupts" (proving nothing about healing) or "always collects nothing"
/// (proving nothing about recovery), so neither half is left to chance:
///
/// 1. **Abandon.** A zero floor with backend background work in flight means a waiter is present
///    from the pass's first poll, so every pass interrupts immediately and collects nothing. The
///    garbage accumulates, unexamined.
/// 2. **Heal.** One uninterruptible pass (`gc_for_testing`) must then find all of it. If an
///    interrupted pass had *lost* garbage rather than left it, this pass would come up short.
///
/// Asserted on GC's **own** collected counts, not the resident task count. Eviction moves tasks to
/// disk after every snapshot, so the resident count falls to near zero whether GC collected the
/// garbage or merely skipped it — it cannot tell the two apart, which is exactly the distinction
/// this test exists to make.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_interrupt_is_self_healing() {
    // Interruptible from the first job, so every pass in phase 1 abandons its work.
    let (tt, _persistence_dir) = create_tt("gc_interrupt_is_self_healing", Duration::ZERO);

    build_generation(&tt, 0).await;

    // Phase 1: accumulate garbage under passes that keep interrupting.
    const ROUNDS: u32 = 10;
    let mut collected_while_interrupting = 0usize;
    let mut interrupted_rounds = 0usize;
    for gen_value in 1..=ROUNDS {
        // Each round disconnects the previous generation: 2*WIDTH tasks of fresh garbage.
        build_generation(&tt, gen_value).await;
        tt.backend().snapshot_and_evict_for_testing(&tt);
        let (collected, interrupted) = tt
            .backend()
            .last_gc_stats_for_testing()
            .expect("a GC pass should have run");
        println!("round {gen_value}: collected={collected} interrupted={interrupted}");
        collected_while_interrupting += collected;
        if interrupted {
            interrupted_rounds += 1;
        }
    }

    // The premise of phase 2: these passes really did abandon work. Without this the test could
    // pass while never exercising interruption at all.
    assert!(
        interrupted_rounds > 0,
        "no pass interrupted across {ROUNDS} rounds at a zero floor, so nothing was abandoned and \
         this test cannot say anything about healing"
    );

    // Phase 2: one pass that runs to completion must recover everything left behind.
    let healed = tt.backend().gc_for_testing(&tt);

    let produced = (2 * WIDTH as usize) * (ROUNDS as usize);
    let total_collected = collected_while_interrupting + healed;
    println!(
        "self-healing: collected_while_interrupting={collected_while_interrupting} \
         healed={healed} total_collected={total_collected} produced={produced} \
         interrupted_rounds={interrupted_rounds}/{ROUNDS}"
    );

    // Every generation but the live one is garbage, so the completing pass has to account for the
    // bulk of what was produced. Falling short here means interrupted passes dropped garbage on
    // the floor instead of leaving it for a successor.
    let expected_min = produced / 2;
    assert!(
        total_collected >= expected_min,
        "GC collected only {total_collected} of ~{produced} garbage tasks \
         ({collected_while_interrupting} during {interrupted_rounds} interrupting rounds, \
         {healed} in the completing pass); interrupted passes are losing garbage instead of \
         leaving it for the next pass"
    );

    tt.stop_and_wait().await;
}
