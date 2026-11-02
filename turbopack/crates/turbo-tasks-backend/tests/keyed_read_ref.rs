#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Tests for `Vc::keyed_reader()` / `KeyedReadRef`: a single read of a keyed cell that afterwards
//! only depends on the keys that were actually accessed.

use std::{pin::Pin, sync::Mutex};

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use turbo_tasks::{KeyedReadRef, OperationVc, ResolvedVc, State, TransientInstance, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state_operation() -> Vc<Step> {
    Step(State::new(0)).cell()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<String, u32>);

/// Step 1: `a = 1, b = 2`
/// Step 2: `b` changed
/// Step 3: `c` added, `a` removed
/// Step 4: `a` added back (only `a` changes compared to step 3)
/// Step 5: only `c` changed compared to step 4
#[turbo_tasks::function(operation, root)]
async fn create_map(step: ResolvedVc<Step>) -> Result<Vc<Map>> {
    let step = step.await?;
    let step_value = step.get();

    Ok(Vc::cell(match *step_value {
        1 => FxHashMap::from_iter([("a".to_string(), 1), ("b".to_string(), 2)]),
        2 => FxHashMap::from_iter([("a".to_string(), 1), ("b".to_string(), 22)]),
        3 => FxHashMap::from_iter([("c".to_string(), 3), ("b".to_string(), 22)]),
        4 => FxHashMap::from_iter([
            ("a".to_string(), 4),
            ("c".to_string(), 3),
            ("b".to_string(), 22),
        ]),
        5 => FxHashMap::from_iter([
            ("a".to_string(), 4),
            ("c".to_string(), 33),
            ("b".to_string(), 22),
        ]),
        _ => FxHashMap::default(),
    }))
}

#[turbo_tasks::value]
struct ReadResult {
    values: Vec<Option<u32>>,
    contains: Vec<bool>,
    random: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    /// Only `keyed_reader()`.
    Keyed,
    /// Full read before `keyed_reader()`.
    FullBefore,
    /// Full read while the `KeyedReadRef` is alive.
    FullWhileAlive,
    /// Two `KeyedReadRef`s alive at the same time, accessing different keys.
    TwoRefs,
    /// The `KeyedReadRef` is dropped in a detached future that shares the task execution's state
    /// (like a local task), which the execution waits for. That's still within the execution.
    DroppedInDetached,
}

const MODES: [Mode; 5] = [
    Mode::Keyed,
    Mode::FullBefore,
    Mode::FullWhileAlive,
    Mode::TwoRefs,
    Mode::DroppedInDetached,
];

/// `mode` is an index into [`MODES`].
#[turbo_tasks::function(operation, root)]
async fn read_keys(map: OperationVc<Map>, keys: Vec<String>, mode: u8) -> Result<Vc<ReadResult>> {
    let mode = MODES[mode as usize];
    let map = map.connect();
    let mut values = Vec::new();
    let mut contains = Vec::new();
    match mode {
        Mode::Keyed => {
            let keyed = map.keyed_reader().await?;
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
        }
        Mode::FullBefore => {
            let full = map.await?;
            let _ = full.len();
            let keyed = map.keyed_reader().await?;
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
        }
        Mode::FullWhileAlive => {
            let keyed = map.keyed_reader().await?;
            let full = map.await?;
            let _ = full.len();
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
        }
        Mode::TwoRefs => {
            let keyed1 = map.keyed_reader().await?;
            let keyed2 = map.keyed_reader().await?;
            for (i, key) in keys.iter().enumerate() {
                let keyed = if i % 2 == 0 { &keyed1 } else { &keyed2 };
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
            drop(keyed1);
            drop(keyed2);
        }
        Mode::DroppedInDetached => {
            let keyed = map.keyed_reader().await?;
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
            turbo_tasks::macro_helpers::spawn_detached_for_testing(async move { drop(keyed) });
        }
    }
    let random = rand::random::<u32>();
    Ok(ReadResult {
        values,
        contains,
        random,
    }
    .cell())
}

async fn check_mode(mode: Mode, expect_unaccessed_change_invalidates: bool) -> Result<()> {
    let state_op = create_state_operation();
    let state_vc = state_op.resolve().strongly_consistent().await?;
    let state = state_op.read_strongly_consistent().await?;
    state.set(1);

    let map = create_map(state_vc);
    // Only reads `a` (and the missing `c`).
    let ac = read_keys(
        map,
        vec!["a".to_string(), "c".to_string()],
        MODES.iter().position(|m| *m == mode).unwrap() as u8,
    );

    let r1 = ac.read_strongly_consistent().await?;
    assert_eq!(r1.values, vec![Some(1), None]);
    assert_eq!(r1.contains, vec![true, false]);

    // Only `b` changes, which isn't accessed.
    state.set(2);
    let r2 = ac.read_strongly_consistent().await?;
    assert_eq!(r2.values, vec![Some(1), None]);
    if expect_unaccessed_change_invalidates {
        assert_ne!(r1.random, r2.random, "{mode:?}: expected re-execution");
    } else {
        assert_eq!(r1.random, r2.random, "{mode:?}: expected no re-execution");
    }

    // `a` removed and `c` added: accessed keys change, always re-executes.
    state.set(3);
    let r3 = ac.read_strongly_consistent().await?;
    assert_eq!(r3.values, vec![None, Some(3)]);
    assert_eq!(r3.contains, vec![false, true]);
    assert_ne!(r2.random, r3.random, "{mode:?}: expected re-execution");

    // Only `a` changes, which is accessed again.
    state.set(4);
    let r4 = ac.read_strongly_consistent().await?;
    assert_eq!(r4.values, vec![Some(4), Some(3)]);
    assert_ne!(r3.random, r4.random, "{mode:?}: expected re-execution");

    // Back to step 3: `a` is removed again, an accessed key, so it re-executes. This also verifies
    // that dependencies from the previous executions are still correctly tracked.
    state.set(3);
    let r5 = ac.read_strongly_consistent().await?;
    assert_eq!(r5.values, vec![None, Some(3)]);
    assert_ne!(r4.random, r5.random, "{mode:?}: expected re-execution");

    anyhow::Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_only_depends_on_accessed_keys() {
    run(&REGISTRATION, async || check_mode(Mode::Keyed, false).await)
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_with_full_read_before() {
    run(&REGISTRATION, async || {
        check_mode(Mode::FullBefore, true).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_with_full_read_while_alive() {
    run(&REGISTRATION, async || {
        check_mode(Mode::FullWhileAlive, true).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_two_refs() {
    run(&REGISTRATION, async || {
        check_mode(Mode::TwoRefs, false).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_dropped_in_detached_future() {
    run(&REGISTRATION, async || {
        check_mode(Mode::DroppedInDetached, false).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_without_access_depends_on_nothing() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let map = create_map(state_vc);
        let none = read_keys(map, vec![], 0);
        let r1 = none.read_strongly_consistent().await?;
        for step in [2, 3, 4] {
            state.set(step);
            let r = none.read_strongly_consistent().await?;
            assert_eq!(r1.random, r.random, "step {step}: expected no re-execution");
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- The accessed keys change between executions: stale keyed dependencies are removed. ---

/// Reads `a`, and only when it's missing also `c`.
#[turbo_tasks::function(operation, root)]
async fn read_a_or_c(map: OperationVc<Map>) -> Result<Vc<ReadResult>> {
    let map = map.connect().keyed_reader().await?;
    let mut values = vec![map.get("a").copied()];
    if values[0].is_none() {
        values.push(map.get("c").copied());
    }
    Ok(ReadResult {
        values,
        contains: vec![],
        random: rand::random(),
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_drops_keys_no_longer_accessed() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let read = read_a_or_c(create_map(state_vc));
        let r1 = read.read_strongly_consistent().await?;
        assert_eq!(r1.values, vec![Some(1)]);

        // `a` removed: now `c` is accessed too.
        state.set(3);
        let r3 = read.read_strongly_consistent().await?;
        assert_eq!(r3.values, vec![None, Some(3)]);
        assert_ne!(r1.random, r3.random, "expected re-execution");

        // `a` added back: `c` is no longer accessed.
        state.set(4);
        let r4 = read.read_strongly_consistent().await?;
        assert_eq!(r4.values, vec![Some(4)]);
        assert_ne!(r3.random, r4.random, "expected re-execution");

        // Only `c` changes. The dependency on `c` from the step 3 execution must be gone.
        state.set(5);
        let r5 = read.read_strongly_consistent().await?;
        assert_eq!(r5.values, vec![Some(4)]);
        assert_eq!(r4.random, r5.random, "expected no re-execution");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- The `keyed_reader()` future is created outside of the task that polls it. ---

type PendingKeyedReadFuture = Pin<Box<dyn Future<Output = Result<KeyedReadRef<Map>>> + Send>>;

struct PendingKeyedRead(Mutex<Option<PendingKeyedReadFuture>>);

#[turbo_tasks::function(root)]
async fn poll_pending_keyed_read(
    pending: TransientInstance<PendingKeyedRead>,
) -> Result<Vc<ReadResult>> {
    // Re-executing the task would find no future, and fail.
    let future = pending
        .0
        .lock()
        .unwrap()
        .take()
        .context("the task was re-executed")?;
    let keyed = future.await?;
    Ok(ReadResult {
        values: vec![keyed.get("a").copied()],
        contains: vec![],
        random: rand::random(),
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_future_created_outside_of_task() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);
        let map_op = create_map(state_vc);
        let map = map_op.resolve().strongly_consistent().await?;

        // Created outside of any task, so it has no keyed dependency: the task that polls it
        // tracks a normal dependency on the whole cell.
        let pending = TransientInstance::new(PendingKeyedRead(Mutex::new(Some(Box::pin(
            map.keyed_reader(),
        )))));
        let read = poll_pending_keyed_read(pending);
        let r1 = read.strongly_consistent().await?;
        assert_eq!(r1.values, vec![Some(1)]);

        // Only `b` changes, which isn't accessed. The map isn't a child of the reading task, so
        // recompute it explicitly. The full dependency re-executes the task, which then fails as
        // the future was already taken.
        state.set(2);
        map_op.read_strongly_consistent().await?;
        let err = read
            .strongly_consistent()
            .await
            .err()
            .expect("expected re-execution");
        assert!(
            format!("{err:?}").contains("the task was re-executed"),
            "unexpected error: {err:?}"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- A `keyed_reader()` future that is dropped without being awaited. ---

#[turbo_tasks::function(operation, root)]
async fn drop_unawaited_keyed_reader(map: OperationVc<Map>) -> Result<Vc<ReadResult>> {
    let map = map.connect();
    drop(map.keyed_reader());
    let keyed = map.keyed_reader().await?;
    Ok(ReadResult {
        values: vec![keyed.get("a").copied()],
        contains: vec![],
        random: rand::random(),
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_reader_future_dropped_unawaited() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let read = drop_unawaited_keyed_reader(create_map(state_vc));
        let r1 = read.read_strongly_consistent().await?;
        assert_eq!(r1.values, vec![Some(1)]);

        // Only `b` changes, which isn't accessed by the awaited read.
        state.set(2);
        let r2 = read.read_strongly_consistent().await?;
        assert_eq!(r1.random, r2.random, "expected no re-execution");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- A change while the `KeyedReadRef` is alive must invalidate the task. ---

#[turbo_tasks::value(transparent)]
struct Executions(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_executions_operation() -> Vc<Executions> {
    Executions(State::new(0)).cell()
}

// --- A `KeyedReadRef` or `keyed_reader()` future that isn't dropped within its task execution
// panics when the execution completes, which aborts the process. ---

const LEAK_MESSAGE: &str = "`KeyedReadRef` was not dropped within the task execution";
const ORIGINAL_ERROR: &str = "original task error";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Leak {
    /// Moved to a different (non-turbo-tasks) thread and dropped there.
    OtherThread,
    /// Never dropped.
    Forgotten,
    /// The `keyed_reader()` future is moved out of the task (to be awaited elsewhere).
    FutureMovedOut,
    /// Not leaked: the task returns an error while the `KeyedReadRef` is alive, so it's dropped
    /// when the error is returned (still within the execution).
    ErrorWhileAlive,
    /// Not leaked: the task panics while the `KeyedReadRef` is alive, so it's dropped while
    /// unwinding (still within the execution).
    PanicWhileAlive,
}

const LEAKS: [Leak; 5] = [
    Leak::OtherThread,
    Leak::Forgotten,
    Leak::FutureMovedOut,
    Leak::ErrorWhileAlive,
    Leak::PanicWhileAlive,
];

/// Where [`Leak::FutureMovedOut`] moves the future to.
static MOVED_OUT_FUTURE: Mutex<Option<PendingKeyedReadFuture>> = Mutex::new(None);
/// Notified when [`MOVED_OUT_FUTURE`] is set.
static MOVED_OUT_FUTURE_READY: tokio::sync::Notify = tokio::sync::Notify::const_new();
/// Notified when another task awaited [`MOVED_OUT_FUTURE`].
static MOVED_OUT_FUTURE_AWAITED: tokio::sync::Notify = tokio::sync::Notify::const_new();

/// Only accesses `a`. `leak` is an index into [`LEAKS`].
#[turbo_tasks::function(operation, root)]
async fn leak_keyed(
    map: OperationVc<Map>,
    leak: u8,
    executions: ResolvedVc<Executions>,
) -> Result<Vc<ReadResult>> {
    let leak = LEAKS[leak as usize];
    // Count executions untracked so this doesn't create a dependency.
    let executions = executions.untracked().await?;
    // Don't hold the guard of `get_untracked` while setting the state.
    let count = *executions.get_untracked() + 1;
    executions.set(count);
    let map = map.connect();
    if leak == Leak::FutureMovedOut {
        *MOVED_OUT_FUTURE.lock().unwrap() = Some(Box::pin(map.keyed_reader()));
        // Keep this execution running until another task awaited the future.
        MOVED_OUT_FUTURE_READY.notify_one();
        MOVED_OUT_FUTURE_AWAITED.notified().await;
        return Ok(ReadResult {
            values: vec![],
            contains: vec![],
            random: rand::random(),
        }
        .cell());
    }
    let keyed = map.keyed_reader().await?;
    let value = keyed.get("a").copied();
    match leak {
        Leak::OtherThread => std::thread::spawn(move || drop(keyed)).join().unwrap(),
        Leak::Forgotten => std::mem::forget(keyed),
        Leak::FutureMovedOut => unreachable!(),
        Leak::ErrorWhileAlive => {
            let _keyed = keyed;
            anyhow::bail!("{ORIGINAL_ERROR}");
        }
        Leak::PanicWhileAlive => {
            let _keyed = keyed;
            panic!("{ORIGINAL_ERROR}");
        }
    }
    Ok(ReadResult {
        values: vec![value],
        contains: vec![],
        random: rand::random(),
    }
    .cell())
}

/// Runs [`leak_keyed`] with `leak` and returns its first result plus what's needed to check it.
async fn run_leak(
    leak: Leak,
) -> Result<(
    Result<turbo_tasks::ReadRef<ReadResult>>,
    turbo_tasks::ReadRef<Step>,
    turbo_tasks::ReadRef<Executions>,
    OperationVc<ReadResult>,
)> {
    let state_op = create_state_operation();
    let state_vc = state_op.resolve().strongly_consistent().await?;
    let state = state_op.read_strongly_consistent().await?;
    state.set(1);
    let executions_op = create_executions_operation();
    let executions_vc = executions_op.resolve().strongly_consistent().await?;
    let executions = executions_op.read_strongly_consistent().await?;

    let op = leak_keyed(
        create_map(state_vc),
        LEAKS.iter().position(|l| *l == leak).unwrap() as u8,
        executions_vc,
    );
    let result = op.read_strongly_consistent().await;
    Ok((result, state, executions, op))
}

/// Not leaked: the original error/panic is kept and the dependency is narrowed to `a`.
async fn check_no_leak(leak: Leak) -> Result<()> {
    let (result, state, executions, op) = run_leak(leak).await?;
    let check_error = |step: u32, err: anyhow::Error| {
        let message = format!("{err:?}");
        assert!(
            message.contains(ORIGINAL_ERROR) && !message.contains(LEAK_MESSAGE),
            "{leak:?} step {step}: expected the original error, got: {message}"
        );
    };
    check_error(1, result.err().expect("expected an error"));
    let count1 = *executions.get_untracked();

    // Only `b` changes, which isn't accessed.
    state.set(2);
    check_error(
        2,
        op.read_strongly_consistent()
            .await
            .err()
            .expect("expected an error"),
    );
    let count2 = *executions.get_untracked();
    assert_eq!(count2, count1, "{leak:?}: expected no re-execution");
    anyhow::Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_error_while_alive_keeps_error() {
    run(&REGISTRATION, async || {
        check_no_leak(Leak::ErrorWhileAlive).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_panic_while_alive_keeps_panic() {
    run(&REGISTRATION, async || {
        check_no_leak(Leak::PanicWhileAlive).await
    })
    .await
    .unwrap()
}

/// Selects the [`Leak`] case (an index into [`LEAKS`]) that [`keyed_read_ref_leak_child`] runs.
const LEAK_CASE_ENV: &str = "TURBO_TASKS_KEYED_READ_REF_LEAK_CASE";
const NO_ABORT_MESSAGE: &str = "keyed_read_ref_leak_child: the process didn't abort";

/// Leaks abort the process, so they run in a child process (this test binary again, running only
/// this test). Without the env var, this test does nothing.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_leak_child() {
    let Ok(case) = std::env::var(LEAK_CASE_ENV) else {
        return;
    };
    let leak = LEAKS[case.parse::<usize>().unwrap()];
    // Bounded, so a missing abort can't hang the test (e.g. `run` also re-runs the closure with a
    // restored cache, where a missing abort would leave the moved-out future never set).
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        run(&REGISTRATION, move || async move {
            if leak == Leak::FutureMovedOut {
                // Await the future in a different task than the one that created it, while the
                // creating execution is still running.
                let await_moved_out = async {
                    MOVED_OUT_FUTURE_READY.notified().await;
                    let future = MOVED_OUT_FUTURE.lock().unwrap().take();
                    let pending = TransientInstance::new(PendingKeyedRead(Mutex::new(future)));
                    let read = poll_pending_keyed_read(pending).strongly_consistent().await;
                    MOVED_OUT_FUTURE_AWAITED.notify_one();
                    assert_eq!(read?.values, vec![Some(1)]);
                    anyhow::Ok(())
                };
                let (leaked, awaited) = tokio::join!(run_leak(leak), await_moved_out);
                awaited?;
                return leaked?.0.map(|_| ());
            }
            let (result, ..) = run_leak(leak).await?;
            result.map(|_| ())
        }),
    )
    .await;
    // The abort happens right after the leaking execution completed, which might be just after
    // its result was published. Only report a missing abort after waiting for it.
    std::thread::sleep(std::time::Duration::from_secs(5));
    // Only reached when the leak didn't abort the process. Exit successfully (without waiting for
    // possibly blocked tasks), so the parent test fails.
    eprintln!("{NO_ABORT_MESSAGE}: {result:?}");
    std::process::exit(0);
}

fn assert_leak_aborts(leak: Leak) {
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "keyed_read_ref_leak_child",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(
            LEAK_CASE_ENV,
            LEAKS.iter().position(|l| *l == leak).unwrap().to_string(),
        )
        .output()
        .unwrap();
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !output.status.success() && !stderr.contains(NO_ABORT_MESSAGE),
        "{leak:?}: expected the process to abort, got {}: {stderr}",
        output.status
    );
    assert!(
        stderr.contains(LEAK_MESSAGE),
        "{leak:?}: expected the leak panic, got: {stderr}"
    );
    assert!(
        stderr.contains("Aborting."),
        "{leak:?}: expected the abort note, got: {stderr}"
    );
}

/// The child processes share the persistent cache directory of
/// [`keyed_read_ref_leak_child`], so the cases run one after another.
#[test]
fn keyed_read_ref_leaks_abort() {
    for leak in [Leak::OtherThread, Leak::Forgotten, Leak::FutureMovedOut] {
        assert_leak_aborts(leak);
    }
}

#[turbo_tasks::function(operation, root)]
async fn read_while_changing(
    map: OperationVc<Map>,
    step: ResolvedVc<Step>,
    executions: ResolvedVc<Executions>,
) -> Result<Vc<ReadResult>> {
    let map = map.connect();
    let keyed = map.keyed_reader().await?;
    let value = keyed.get("a").copied();
    // Count executions untracked so this doesn't create a dependency.
    let executions = executions.untracked().await?;
    let count = *executions.get_untracked() + 1;
    executions.set(count);
    if count == 1 {
        // Change the unaccessed key `b` while the `KeyedReadRef` is still alive. The full
        // (keyed-read) dependency is still in effect, so this has to invalidate this task.
        step.untracked().await?.set(2);
        // Wait until the map is recomputed with the new value.
        let mut attempts = 0;
        loop {
            let current = map.untracked().await?;
            if current.get("b") == Some(&22) {
                break;
            }
            attempts += 1;
            anyhow::ensure!(attempts < 500, "the map was not recomputed");
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }
    drop(keyed);
    Ok(ReadResult {
        values: vec![value],
        contains: vec![],
        random: count,
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn keyed_read_ref_change_while_alive_invalidates() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);
        let executions_op = create_executions_operation();
        let executions_vc = executions_op.resolve().strongly_consistent().await?;

        let map = create_map(state_vc);
        let result = read_while_changing(map, state_vc, executions_vc)
            .read_strongly_consistent()
            .await?;
        assert_eq!(result.values, vec![Some(1)]);
        // The first execution was invalidated by the change, so the task ran (at least) twice.
        assert!(result.random >= 2, "executions: {}", result.random);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
