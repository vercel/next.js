#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU64, Ordering},
};

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, State, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, GitVersionInfo, TurboBackingStorage, TurboTasksBackend};

/// Creates a fresh per-call persistence directory rooted under
/// `CARGO_TARGET_TMPDIR/.cache/`, with the test `name` as a prefix so failed
/// runs are easy to find on disk. The unique suffix from `tempfile` lets
/// multiple processes (or repeated invocations of the same test) run in
/// parallel without trampling each other's database.
///
/// The returned [`tempfile::TempDir`] cleans up its contents on drop, so
/// callers should keep it alive at least until the `TurboTasks` it backs has
/// finished shutting down (so the final snapshot can flush to disk).
fn create_test_persistence_dir(name: &str) -> tempfile::TempDir {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    tempfile::Builder::new()
        .prefix(&format!("{name}-"))
        .tempdir_in(&parent)
        .unwrap()
}

fn create_tt_with_workers(
    name: &str,
    num_workers: usize,
) -> (
    Arc<TurboTasks<TurboTasksBackend<TurboBackingStorage>>>,
    tempfile::TempDir,
) {
    let dir = create_test_persistence_dir(name);
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(num_workers),
            small_preallocation: true,
            // Avoid racing with the background snapshot loop; the test drives
            // snapshot_and_evict_for_testing manually.
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            evict_after_snapshot: true,
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

fn create_tt(
    name: &str,
) -> (
    Arc<TurboTasks<TurboTasksBackend<TurboBackingStorage>>>,
    tempfile::TempDir,
) {
    create_tt_with_workers(name, 2)
}

/// Verify that after eviction, task re-execution produces correct results.
/// This tests the snapshot → evict → invalidate → restore → re-execute cycle.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn eviction_recompute() {
    let (tt, _persistence_dir) = create_tt("eviction_recompute");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        // Create state via operation (persistent task)
        let state_op = create_state(1);
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;

        // Create compute task (persistent, depends on state)
        let output = compute(state_vc);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 1);
        let initial_random = read.random;

        // Trigger snapshot + eviction
        let (had_data, counts) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("snapshot had_data={had_data}, evicted: {counts:?}");
        assert!(had_data, "snapshot should have persisted data");

        // Invalidate via state change — this requires restoring evicted tasks
        state.set(2);

        // Read again — tasks must be restored from disk before re-executing
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 2);
        assert_ne!(read.random, initial_random);

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// Verify that eviction works with a deep (4-level) dependency chain.
/// Multiple intermediate tasks should be evicted and restored correctly.
/// Chain: create_state → add_one → times_three → plus_ten → deep_chain
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn eviction_deep_chain() {
    let (tt, _persistence_dir) = create_tt("eviction_deep_chain");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let state_op = create_state(10);
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;

        let output = deep_chain(state_vc);
        let read = output.read_strongly_consistent().await?;
        // (10+1)*3+10 = 43
        assert_eq!(read.value, 43);
        let initial_random = read.random;

        // Snapshot + evict — expect multiple intermediate tasks evicted
        let (had_data, counts) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("deep_chain: snapshot had_data={had_data}, evicted: {counts:?}");
        assert!(had_data, "snapshot should have persisted data");
        assert!(
            counts.full + counts.data_and_meta + counts.data_only + counts.meta_only > 0,
            "expected some tasks to be evicted"
        );

        // Change the deepest input — must propagate through all restored tasks
        state.set(20);

        let read = output.read_strongly_consistent().await?;
        // (20+1)*3+10 = 73
        assert_eq!(read.value, 73);
        assert_ne!(read.random, initial_random);
        let random_after_first = read.random;

        // Evict again and change again
        let (had_data2, counts2) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("deep_chain (2nd): snapshot had_data={had_data2}, evicted: {counts2:?}");

        state.set(0);

        let read = output.read_strongly_consistent().await?;
        // (0+1)*3+10 = 13
        assert_eq!(read.value, 13);
        assert_ne!(read.random, random_after_first);

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// Verify that eviction + restore preserves dependency edges correctly.
/// After eviction, changing a deep dependency should still propagate
/// through the entire chain.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn eviction_dependency_chain() {
    let (tt, _persistence_dir) = create_tt("eviction_dependency_chain");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let state_op = create_state(10);
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;

        let output = compute_chain(state_vc);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 20); // 10 * 2
        let initial_random = read.random;

        // Snapshot + evict
        let (had_data, counts) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("snapshot had_data={had_data}, evicted: {counts:?}");
        assert!(had_data, "snapshot should have persisted data");
        assert!(
            counts.full + counts.data_and_meta + counts.data_only + counts.meta_only > 0,
            "expected some tasks to be evicted"
        );

        // Change the deepest input
        state.set(5);

        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 10); // 5 * 2
        assert_ne!(read.random, initial_random);
        let random_after_first = read.random;

        // Evict again
        let (had_data2, counts2) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("snapshot (2nd) had_data={had_data2}, evicted: {counts2:?}");

        // Change again
        state.set(100);

        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 200); // 100 * 2
        assert_ne!(read.random, random_after_first);

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation)]
fn create_state(initial: u32) -> Vc<Step> {
    Step(State::new(initial)).cell()
}

#[turbo_tasks::value]
struct Output {
    value: u32,
    random: u32,
}

#[turbo_tasks::function(operation)]
async fn compute(input: ResolvedVc<Step>) -> Result<Vc<Output>> {
    let value = *input.await?.get();
    Ok(Output {
        value,
        random: rand::random(),
    }
    .cell())
}

/// Inner function in the dependency chain
#[turbo_tasks::function(operation)]
async fn double(input: ResolvedVc<Step>) -> Result<Vc<u32>> {
    let value = *input.await?.get();
    Ok(Vc::cell(value * 2))
}

/// Outer function that depends on `double`
#[turbo_tasks::function(operation)]
async fn compute_chain(input: ResolvedVc<Step>) -> Result<Vc<Output>> {
    let doubled = double(input);
    let value = *doubled.connect().await?;
    Ok(Output {
        value,
        random: rand::random(),
    }
    .cell())
}

// =========================================================================
// Deep chain helpers — each layer reads the previous layer's output
// =========================================================================

#[turbo_tasks::function(operation)]
async fn add_one(input: ResolvedVc<Step>) -> Result<Vc<u32>> {
    let value = *input.await?.get();
    Ok(Vc::cell(value + 1))
}

#[turbo_tasks::function(operation)]
async fn times_three(input: ResolvedVc<u32>) -> Result<Vc<u32>> {
    let value = *input.await?;
    Ok(Vc::cell(value * 3))
}

#[turbo_tasks::function(operation)]
async fn plus_ten(input: ResolvedVc<u32>) -> Result<Vc<u32>> {
    let value = *input.await?;
    Ok(Vc::cell(value + 10))
}

#[turbo_tasks::function(operation)]
async fn deep_chain(input: ResolvedVc<Step>) -> Result<Vc<Output>> {
    // input → add_one → times_three → plus_ten → Output
    // For input=10: (10+1)*3+10 = 43
    let a = add_one(input).resolve().strongly_consistent().await?;
    let b = times_three(a).resolve().strongly_consistent().await?;
    let c = plus_ten(b).resolve().strongly_consistent().await?;
    let value = *c.await?;
    Ok(Output {
        value,
        random: rand::random(),
    }
    .cell())
}

// =========================================================================
// Session-stateful value — accumulates interior state that should not be
// evicted mid-session.
// =========================================================================

/// A value marked `serialization = "none"` — tasks that write cells of this type cannot be
/// persisted, so their data lives in `transient_cell_data` and is protected from eviction by
/// the existing transient-cell check in the storage schema.
#[turbo_tasks::value(serialization = "skip", evict = "never", cell = "new", eq = "manual")]
struct SessionCounter {
    count: u32,
}

/// Intermediate operation task that writes a session-stateful cell.
/// Because this task is only resolved (not directly read) by the top-level
/// transient task, it has no transient dependents and is eligible for eviction
/// consideration — but should be blocked by the session-stateful flag.
#[turbo_tasks::function(operation)]
fn create_session_counter(initial: u32) -> Vc<SessionCounter> {
    SessionCounter { count: initial }.cell()
}

/// Resolves the session counter internally so the transient run_once task
/// doesn't need to resolve it directly (which would add a transient dependent
/// edge to create_session_counter, preventing us from testing the
/// session-stateful eviction gate).
#[turbo_tasks::function(operation)]
async fn read_session_counter(initial: u32) -> Result<Vc<Output>> {
    let counter = create_session_counter(initial)
        .resolve()
        .strongly_consistent()
        .await?;
    let c = counter.await?;
    Ok(Output {
        value: c.count,
        random: rand::random(),
    }
    .cell())
}

/// Verify that tasks with session-stateful cells are NOT evicted, while
/// normal persistent tasks without transient dependents ARE evicted.
///
/// Uses a two-layer chain so that create_session_counter (the task that writes
/// the session-stateful cell) has no transient dependents — only
/// read_session_counter reads it, and it is itself a persistent task.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn eviction_session_stateful_survives() {
    let (tt, _persistence_dir) = create_tt("eviction_session_stateful_survives");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        // read_session_counter internally creates+resolves create_session_counter(42).
        // The transient run_once only reads read_session_counter, so
        // create_session_counter has no transient dependents and is eligible for
        // eviction consideration — but should be blocked by SessionStateful.
        let reader = read_session_counter(42);
        let read = reader.read_strongly_consistent().await?;
        assert_eq!(read.value, 42);

        // Also build a normal (evictable) chain for comparison
        let state_op = create_state(10);
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let normal = deep_chain(state_vc);
        let normal_read = normal.read_strongly_consistent().await?;
        // (10+1)*3+10 = 43
        assert_eq!(normal_read.value, 43);

        // Snapshot + evict
        let (had_data, counts) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("session_stateful: snapshot had_data={had_data}, evicted: {counts:?}");
        assert!(had_data, "snapshot should have persisted data");
        // The normal intermediate tasks (add_one, times_three, plus_ten) should be
        // evicted. The session-stateful create_session_counter should NOT be fully
        // evicted (its data is blocked by has_session_stateful_cells).
        assert!(
            counts.full + counts.data_and_meta + counts.data_only + counts.meta_only > 0,
            "normal intermediate tasks should be evicted"
        );

        // After eviction, reading through the session-stateful chain should still work
        let read2 = reader.read_strongly_consistent().await?;
        assert_eq!(read2.value, 42);

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// Verify that transient tasks reading persistent tasks still get invalidated
/// after the persistent tasks are evicted and restored.
///
/// The `run_once` closure is itself a transient task. We create persistent
/// operation tasks, evict them, then mutate state and confirm the transient
/// reader sees the updated value.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn eviction_transient_reader_invalidated() {
    let (tt, _persistence_dir) = create_tt("eviction_transient_reader_invalidated");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        // Create persistent state + compute tasks
        let state_op = create_state(50);
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;

        let output = compute(state_vc);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 50);
        let initial_random = read.random;

        // Snapshot + evict. The persistent `compute` task has a transient dependent
        // (this run_once closure), so it may be blocked from full eviction. But we
        // still exercise the evict path — some tasks (like create_state) may be
        // data-only evicted.
        let (had_data, counts) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("transient_reader: snapshot had_data={had_data}, evicted: {counts:?}");
        assert!(had_data, "snapshot should have persisted data");

        // Mutate state — this invalidates the persistent task, which must propagate
        // to the transient reader (this closure) even after eviction.
        state.set(99);

        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 99);
        assert_ne!(
            read.random, initial_random,
            "task should have been re-executed after invalidation"
        );

        // Second eviction cycle
        let (_, counts2) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("transient_reader (2nd): evicted: {counts2:?}");

        state.set(0);

        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.value, 0);

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

// =========================================================================
// Stress test — concurrent eviction + restore
// =========================================================================

/// Adds an offset to a value — the offset parameter makes each call a unique
/// memoized task, creating truly independent intermediate tasks for fan-out.
#[turbo_tasks::function(operation)]
async fn add_offset(input: ResolvedVc<Step>, offset: u32) -> Result<Vc<u32>> {
    let value = *input.await?.get();
    Ok(Vc::cell(value.wrapping_add(offset)))
}

/// Multiplies by a factor — unique per factor argument.
#[turbo_tasks::function(operation)]
async fn multiply(input: ResolvedVc<u32>, factor: u32) -> Result<Vc<u32>> {
    let value = *input.await?;
    Ok(Vc::cell(value.wrapping_mul(factor)))
}

/// Wide fan-out helper: creates `width` independent compute chains from a
/// single state. Each chain uses unique arguments (offset/factor) so they
/// produce distinct memoized tasks — `width * 2` intermediate persistent tasks
/// that are candidates for eviction.
#[turbo_tasks::function(operation)]
async fn fan_out(input: ResolvedVc<Step>, width: u32) -> Result<Vc<u32>> {
    let mut total = 0u32;
    for i in 0..width {
        let a = add_offset(input, i).resolve().strongly_consistent().await?;
        let b = multiply(a, i.wrapping_add(2))
            .resolve()
            .strongly_consistent()
            .await?;
        total = total.wrapping_add(*b.await?);
    }
    Ok(Vc::cell(total))
}

/// Stress test: a background thread continuously evicts while the main task
/// invalidates and reads through a wide fan-out of tasks. This creates true
/// concurrency between eviction (which clears data under shard write locks)
/// and restore (which releases the lock during disk I/O then re-acquires).
///
/// Before the restoring-bit fix, this would panic with "Cell no longer exists"
/// because eviction could clear data on a task mid-restore.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn eviction_stress_concurrent() {
    let (tt, _persistence_dir) = create_tt_with_workers("eviction_stress_concurrent", 4);
    let tt_evict = tt.clone();

    let stop = Arc::new(AtomicBool::new(false));
    let stop_clone = stop.clone();
    let eviction_cycles = Arc::new(AtomicU64::new(0));
    let eviction_cycles_clone = eviction_cycles.clone();

    // Background thread: snapshot+evict with a short sleep to avoid starving
    // worker threads, but fast enough to race with restores.
    let eviction_handle = tokio::task::spawn_blocking(move || {
        while !stop_clone.load(Ordering::Relaxed) {
            tt_evict
                .backend()
                .snapshot_and_evict_for_testing(&*tt_evict);
            eviction_cycles_clone.fetch_add(1, Ordering::Relaxed);
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    });

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let state_op = create_state(1);
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;

        // fan_out creates width * 2 intermediate tasks per call
        let width = 20u32;
        let output = fan_out(state_vc, width);

        // Helper: compute the expected fan_out result for a given state value.
        // fan_out sums (state + i) * (i + 2) for i in 0..width.
        let expected_for = |state_val: u32| -> u32 {
            (0..width)
                .map(|i| state_val.wrapping_add(i).wrapping_mul(i.wrapping_add(2)))
                .fold(0u32, |acc, x| acc.wrapping_add(x))
        };

        // Initial read to populate all tasks in memory, then wait for the
        // background eviction thread to snapshot + evict at least once so data
        // is on disk and eligible for eviction on subsequent cycles.
        let read = *output.read_strongly_consistent().await?;
        assert_eq!(read, expected_for(1));
        // Give the background eviction thread time to run a snapshot+evict cycle.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        // Run invalidation cycles while the background eviction thread is active.
        // The sleep between eviction cycles gives worker threads time to start
        // restoring, then eviction runs and races with in-flight restores.
        for i in 1u32..=50 {
            state.set(i);
            let read = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                output.read_strongly_consistent(),
            )
            .await
            .unwrap_or_else(|_| {
                panic!(
                    "cycle {i}: timed out waiting for read — likely a restore/eviction race \
                     corrupted the task graph"
                )
            })?;
            let read = *read;
            assert_eq!(
                read,
                expected_for(i),
                "cycle {i}: expected {}, got {read}",
                expected_for(i)
            );
        }

        anyhow::Ok(())
    })
    .await;

    stop.store(true, Ordering::Relaxed);
    eviction_handle.await.unwrap();
    let cycles = eviction_cycles.load(Ordering::Relaxed);
    println!("stress test completed with {cycles} eviction cycles");

    tt.stop_and_wait().await;
    result.unwrap();
}

fn fresh_decoded_alive() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

#[turbo_tasks::value(evict = "never", eq = "manual")]
struct SessionAlive {
    count: u32,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip, default = "fresh_decoded_alive")]
    alive: Arc<AtomicBool>,
}

impl PartialEq for SessionAlive {
    fn eq(&self, other: &Self) -> bool {
        // Eq on the persisted field only; the `alive` Arc is session state.
        self.count == other.count
    }
}
impl Eq for SessionAlive {}

/// Produces a `SessionAlive` cell. Constant input so the operation is
/// memoized — re-running the test's outer flow doesn't invalidate it.
#[turbo_tasks::function]
fn create_session_alive() -> Vc<SessionAlive> {
    SessionAlive {
        count: 7,
        alive: Arc::new(AtomicBool::new(true)),
    }
    .cell()
}

/// Persistent operation that resolves through `create_session_alive`. The
/// writer therefore has only this persistent parent — not the transient
/// run_once — and is eligible for the eviction sweep. The `Step` input
/// gives us a knob to invalidate this reader (forcing re-read of the
/// writer's cell) without invalidating `create_session_alive` itself.
#[turbo_tasks::function(operation)]
async fn read_session_alive_id(state: ResolvedVc<Step>) -> Result<Vc<AlivePtr>> {
    let _state = *state.await?.get();
    let v = create_session_alive().resolve().await?;
    let r = v.await?;
    let alive_now = r.alive.load(Ordering::Relaxed);
    let alive_ptr = Arc::as_ptr(&r.alive) as usize as u64;
    Ok(AlivePtr {
        alive: alive_now,
        ptr: alive_ptr,
        random: rand::random(),
    }
    .cell())
}

#[turbo_tasks::value]
struct AlivePtr {
    alive: bool,
    ptr: u64,
    random: u32,
}

/// Reproduces the `Persistable + evict = "never"` regression: the cell is
/// retained in residue by `drop_partial`, but `restore_data_from` runs
/// `extend(incoming)` over `cell_data` and overwrites the live `Arc` with
/// a freshly decoded one whose `#[bincode(skip)]` fields are defaulted.
///
/// Strategy:
///   1. Build the `SessionAlive` cell once, capture its live `alive` flag's pointer.
///   2. Snapshot + evict — `drop_partial` retains the cell, but sets `data_restored=false`.
///   3. Force a fresh resolve of the writer task. The `.await` on the resolved Vc reads the cell,
///      which goes through `task(.., Data)` → triggers restore → `restore_data_from` →
///      `extend(incoming)` overwrites the residue with the decoded copy whose `alive` Arc is the
///      freshly-defaulted (`false`) one.
///   4. Read the cell again. With the bug active the value's `alive` flag is now `false` and the
///      captured pointer no longer matches the cell's current `alive` Arc.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn eviction_persistable_never_preserves_live_cell() {
    let (tt, _persistence_dir) = create_tt("eviction_persistable_never_preserves_live_cell");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let state_op = create_state(0);
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;

        // First read goes through `read_session_alive_id` so the writer
        // (`create_session_alive`) has a persistent parent and is eligible
        // for the eviction sweep without being held alive by run_once.
        let pre = read_session_alive_id(state_vc)
            .read_strongly_consistent()
            .await?;
        assert!(pre.alive, "freshly constructed cell should be alive");
        let live_ptr = pre.ptr;
        drop(pre);

        // Snapshot + evict. `create_session_alive`'s `cell_data` should retain
        // the SessionAlive cell as residue (Evictability::Never), while
        // clearing `data_restored` and persisted data flag bits.
        let (had_data, counts) = tt2.backend().snapshot_and_evict_for_testing(&*tt2);
        println!("persistable_never: snapshot had_data={had_data}, evicted: {counts:?}");
        assert!(had_data, "snapshot should have persisted data");

        // Invalidate the reader so the next read re-runs `read_session_alive_id`.
        // That re-execution reads `create_session_alive`'s cell, which goes
        // through `task(.., Data)` and triggers `restore_data_from` — the buggy
        // path here runs `extend(incoming)` over `cell_data` and replaces the
        // live Arc with a freshly decoded one whose `alive` is default.
        state.set(1);

        let post = read_session_alive_id(state_vc)
            .read_strongly_consistent()
            .await?;
        println!(
            "post-restore: alive={}, ptr_match={}",
            post.alive,
            post.ptr == live_ptr
        );

        assert_eq!(
            post.ptr, live_ptr,
            "post-restore cell must still hold the live `alive` Arc; a different pointer means \
             restore_data_from overwrote the residue with a freshly decoded copy"
        );
        assert!(
            post.alive,
            "post-restore cell must still report alive=true; alive=false means the live cell \
             value was replaced by a decoded copy with default fields"
        );

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}
