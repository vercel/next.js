#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Tests for `Vc::lazy_reader()` / `LazyReadRef`: a read that is canceled (its dependency is
//! removed) when the value is never accessed via `LazyReadRef::get`.

use std::{pin::Pin, sync::Mutex};

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use turbo_tasks::{LazyReadRef, OperationVc, ResolvedVc, State, TransientInstance, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state_operation() -> Vc<Step> {
    Step(State::new(0)).cell()
}

#[turbo_tasks::value(transparent)]
struct Flag(State<bool>);

#[turbo_tasks::function(operation, root)]
fn create_flag_operation() -> Vc<Flag> {
    Flag(State::new(false)).cell()
}

#[turbo_tasks::value(transparent)]
struct Executions(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_executions_operation() -> Vc<Executions> {
    Executions(State::new(0)).cell()
}

/// A plain (non-keyed) value whose content changes with every step.
#[turbo_tasks::value]
struct Value {
    step: u32,
}

#[turbo_tasks::function(operation, root)]
async fn create_value(step: ResolvedVc<Step>) -> Result<Vc<Value>> {
    let step = *step.await?.get();
    Ok(Value { step }.cell())
}

/// Step 1: `a = 1, b = 2`
/// Step 2: only `b` changed
/// Step 3: only `a` changed
#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<String, u32>);

#[turbo_tasks::function(operation, root)]
async fn create_map(step: ResolvedVc<Step>) -> Result<Vc<Map>> {
    let step = *step.await?.get();
    Ok(Vc::cell(match step {
        1 => FxHashMap::from_iter([("a".to_string(), 1), ("b".to_string(), 2)]),
        2 => FxHashMap::from_iter([("a".to_string(), 1), ("b".to_string(), 22)]),
        3 => FxHashMap::from_iter([("a".to_string(), 11), ("b".to_string(), 22)]),
        _ => FxHashMap::default(),
    }))
}

#[turbo_tasks::value]
struct ReadResult {
    value: Option<u32>,
    random: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    /// A single lazy read, accessed iff `access`.
    Lazy,
    /// Two lazy reads of the same cell alive at the same time. The first one is accessed iff
    /// `access`, the second one is never accessed.
    TwoLazy,
    /// Like `TwoLazy`, but the refs are dropped in reverse order.
    TwoLazyReverseDrop,
    /// A full read before an unaccessed lazy read.
    FullBefore,
    /// A full read while an unaccessed lazy read is alive.
    FullWhileAlive,
    /// The `LazyReadRef` is accessed iff `access` and dropped in a detached future that shares the
    /// task execution's state, which the execution waits for. That's still within the execution.
    DroppedInDetached,
    /// A `lazy_reader()` future that is dropped without being awaited, then a lazy read accessed
    /// iff `access`.
    FutureDroppedUnawaited,
}

const MODES: [Mode; 7] = [
    Mode::Lazy,
    Mode::TwoLazy,
    Mode::TwoLazyReverseDrop,
    Mode::FullBefore,
    Mode::FullWhileAlive,
    Mode::DroppedInDetached,
    Mode::FutureDroppedUnawaited,
];

fn mode_index(mode: Mode) -> u8 {
    MODES.iter().position(|m| *m == mode).unwrap() as u8
}

/// `mode` is an index into [`MODES`].
#[turbo_tasks::function(operation, root)]
async fn read_lazy(value: OperationVc<Value>, mode: u8, access: bool) -> Result<Vc<ReadResult>> {
    let mode = MODES[mode as usize];
    let value = value.connect();
    let mut result = None;
    match mode {
        Mode::Lazy => {
            let lazy = value.lazy_reader().await?;
            // Formatting must not count as an access.
            let _ = format!("{lazy:?}");
            if access {
                result = Some(lazy.get().step);
            }
        }
        Mode::TwoLazy | Mode::TwoLazyReverseDrop => {
            let lazy1 = value.lazy_reader().await?;
            let lazy2 = value.lazy_reader().await?;
            if access {
                result = Some(lazy1.get().step);
            }
            if mode == Mode::TwoLazy {
                drop(lazy1);
                drop(lazy2);
            } else {
                drop(lazy2);
                drop(lazy1);
            }
        }
        Mode::FullBefore => {
            result = Some(value.await?.step);
            let _lazy = value.lazy_reader().await?;
        }
        Mode::FullWhileAlive => {
            let lazy = value.lazy_reader().await?;
            result = Some(value.await?.step);
            drop(lazy);
        }
        Mode::DroppedInDetached => {
            let lazy = value.lazy_reader().await?;
            if access {
                result = Some(lazy.get().step);
            }
            turbo_tasks::macro_helpers::spawn_detached_for_testing(async move { drop(lazy) });
        }
        Mode::FutureDroppedUnawaited => {
            drop(value.lazy_reader());
            let lazy = value.lazy_reader().await?;
            if access {
                result = Some(lazy.get().step);
            }
        }
    }
    Ok(ReadResult {
        value: result,
        random: rand::random(),
    }
    .cell())
}

async fn check_mode(mode: Mode, access: bool, expect_invalidation: bool) -> Result<()> {
    let state_op = create_state_operation();
    let state_vc = state_op.resolve().strongly_consistent().await?;
    let state = state_op.read_strongly_consistent().await?;
    state.set(1);

    let read = read_lazy(create_value(state_vc), mode_index(mode), access);
    let mut previous = read.read_strongly_consistent().await?;
    for step in [2, 3, 4] {
        state.set(step);
        let current = read.read_strongly_consistent().await?;
        if expect_invalidation {
            assert_ne!(
                previous.random, current.random,
                "{mode:?} access={access} step {step}: expected re-execution"
            );
            if access || !matches!(mode, Mode::TwoLazy | Mode::TwoLazyReverseDrop) {
                assert_eq!(current.value, Some(step), "{mode:?} step {step}");
            }
        } else {
            assert_eq!(
                previous.random, current.random,
                "{mode:?} access={access} step {step}: expected no re-execution"
            );
        }
        previous = current;
    }
    anyhow::Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_unaccessed_does_not_depend() {
    run(&REGISTRATION, async || {
        check_mode(Mode::Lazy, false, false).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_accessed_depends() {
    run(&REGISTRATION, async || {
        check_mode(Mode::Lazy, true, true).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_two_refs_one_accessed() {
    run(&REGISTRATION, async || {
        check_mode(Mode::TwoLazy, true, true).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_two_refs_none_accessed() {
    run(&REGISTRATION, async || {
        check_mode(Mode::TwoLazy, false, false).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_two_refs_reverse_drop() {
    run(&REGISTRATION, async || {
        check_mode(Mode::TwoLazyReverseDrop, true, true).await?;
        check_mode(Mode::TwoLazyReverseDrop, false, false).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_unaccessed_with_full_read_before() {
    run(&REGISTRATION, async || {
        check_mode(Mode::FullBefore, false, true).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_unaccessed_with_full_read_while_alive() {
    run(&REGISTRATION, async || {
        check_mode(Mode::FullWhileAlive, false, true).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_dropped_in_detached_future() {
    run(&REGISTRATION, async || {
        check_mode(Mode::DroppedInDetached, false, false).await?;
        check_mode(Mode::DroppedInDetached, true, true).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_reader_future_dropped_unawaited() {
    run(&REGISTRATION, async || {
        check_mode(Mode::FutureDroppedUnawaited, false, false).await?;
        check_mode(Mode::FutureDroppedUnawaited, true, true).await
    })
    .await
    .unwrap()
}

// --- Mixed with keyed reads of the same cell: only the keyed semantics remain. ---

#[turbo_tasks::function(operation, root)]
async fn read_lazy_and_keyed(map: OperationVc<Map>, batched: bool) -> Result<Vc<ReadResult>> {
    let map = map.connect();
    let lazy = map.lazy_reader().await?;
    let value = if batched {
        let keyed = map.keyed_reader().await?;
        keyed.get("a").copied()
    } else {
        map.get("a").await?.as_deref().copied()
    };
    drop(lazy);
    Ok(ReadResult {
        value,
        random: rand::random(),
    }
    .cell())
}

async fn check_lazy_and_keyed(batched: bool) -> Result<()> {
    let state_op = create_state_operation();
    let state_vc = state_op.resolve().strongly_consistent().await?;
    let state = state_op.read_strongly_consistent().await?;
    state.set(1);

    let read = read_lazy_and_keyed(create_map(state_vc), batched);
    let r1 = read.read_strongly_consistent().await?;
    assert_eq!(r1.value, Some(1));

    // Only `b` changes, which isn't accessed.
    state.set(2);
    let r2 = read.read_strongly_consistent().await?;
    assert_eq!(
        r1.random, r2.random,
        "batched={batched}: expected no re-execution"
    );

    // `a` changes.
    state.set(3);
    let r3 = read.read_strongly_consistent().await?;
    assert_eq!(r3.value, Some(11));
    assert_ne!(
        r2.random, r3.random,
        "batched={batched}: expected re-execution"
    );
    anyhow::Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_unaccessed_with_keyed_read() {
    run(&REGISTRATION, async || check_lazy_and_keyed(false).await)
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_unaccessed_with_keyed_read_ref() {
    run(&REGISTRATION, async || check_lazy_and_keyed(true).await)
        .await
        .unwrap()
}

// --- Whether the value is accessed changes between executions. ---

#[turbo_tasks::function(operation, root)]
async fn read_lazy_if_flag(
    value: OperationVc<Value>,
    flag: ResolvedVc<Flag>,
) -> Result<Vc<ReadResult>> {
    let access = *flag.await?.get();
    let lazy = value.connect().lazy_reader().await?;
    let value = access.then(|| lazy.get().step);
    Ok(ReadResult {
        value,
        random: rand::random(),
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_access_changes_between_executions() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);
        let flag_op = create_flag_operation();
        let flag_vc = flag_op.resolve().strongly_consistent().await?;
        let flag = flag_op.read_strongly_consistent().await?;
        flag.set(true);

        let read = read_lazy_if_flag(create_value(state_vc), flag_vc);
        let r1 = read.read_strongly_consistent().await?;
        assert_eq!(r1.value, Some(1));

        // Accessed: depends on the value.
        state.set(2);
        let r2 = read.read_strongly_consistent().await?;
        assert_eq!(r2.value, Some(2));
        assert_ne!(r1.random, r2.random, "expected re-execution");

        // No longer accessed: the dependency from the previous execution must be gone.
        flag.set(false);
        let r3 = read.read_strongly_consistent().await?;
        assert_eq!(r3.value, None);
        assert_ne!(r2.random, r3.random, "expected re-execution");
        state.set(3);
        let r4 = read.read_strongly_consistent().await?;
        assert_eq!(r3.random, r4.random, "expected no re-execution");

        // Accessed again: depends on the value again.
        flag.set(true);
        let r5 = read.read_strongly_consistent().await?;
        assert_eq!(r5.value, Some(3));
        assert_ne!(r4.random, r5.random, "expected re-execution");
        state.set(4);
        let r6 = read.read_strongly_consistent().await?;
        assert_eq!(r6.value, Some(4));
        assert_ne!(r5.random, r6.random, "expected re-execution");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- A change while the `LazyReadRef` is alive must invalidate the task. ---

#[turbo_tasks::function(operation, root)]
async fn read_lazy_while_changing(
    value: OperationVc<Value>,
    step: ResolvedVc<Step>,
    executions: ResolvedVc<Executions>,
) -> Result<Vc<ReadResult>> {
    let value = value.connect();
    let lazy = value.lazy_reader().await?;
    // Count executions untracked so this doesn't create a dependency.
    let executions = executions.untracked().await?;
    let count = *executions.get_untracked() + 1;
    executions.set(count);
    if count == 1 {
        // Change the value while the `LazyReadRef` is still alive. Its dependency is still in
        // effect, so this has to invalidate this task, even though the value is never accessed.
        step.untracked().await?.set(2);
        // Wait until the value is recomputed.
        let mut attempts = 0;
        loop {
            if value.untracked().await?.step == 2 {
                break;
            }
            attempts += 1;
            anyhow::ensure!(attempts < 500, "the value was not recomputed");
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }
    drop(lazy);
    Ok(ReadResult {
        value: None,
        random: count,
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_change_while_alive_invalidates() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);
        let executions_op = create_executions_operation();
        let executions_vc = executions_op.resolve().strongly_consistent().await?;

        let result = read_lazy_while_changing(create_value(state_vc), state_vc, executions_vc)
            .read_strongly_consistent()
            .await?;
        // The first execution was invalidated by the change, so the task ran (at least) twice.
        assert!(result.random >= 2, "executions: {}", result.random);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- A `lazy_reader()` future created outside of a task tracks a normal dependency. ---

type PendingLazyReadFuture = Pin<Box<dyn Future<Output = Result<LazyReadRef<Value>>> + Send>>;

struct PendingLazyRead(Mutex<Option<PendingLazyReadFuture>>);

/// Awaits the pending future and never accesses the value.
#[turbo_tasks::function(root)]
async fn poll_pending_lazy_read(
    pending: TransientInstance<PendingLazyRead>,
) -> Result<Vc<ReadResult>> {
    // Re-executing the task would find no future, and fail.
    let future = pending
        .0
        .lock()
        .unwrap()
        .take()
        .context("the task was re-executed")?;
    let lazy = future.await?;
    drop(lazy);
    Ok(ReadResult {
        value: None,
        random: rand::random(),
    }
    .cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_future_created_outside_of_task() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);
        let value_op = create_value(state_vc);
        let value = value_op.resolve().strongly_consistent().await?;

        // Created outside of any task, so the read can't be canceled: the task that polls it
        // tracks a normal dependency on the cell, even though it never accesses the value.
        let pending = TransientInstance::new(PendingLazyRead(Mutex::new(Some(Box::pin(
            value.lazy_reader(),
        )))));
        let read = poll_pending_lazy_read(pending);
        read.strongly_consistent().await?;

        // The value isn't a child of the reading task, so recompute it explicitly. The full
        // dependency re-executes the task, which then fails as the future was already taken.
        state.set(2);
        value_op.read_strongly_consistent().await?;
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

// --- A `LazyReadRef` or `lazy_reader()` future that isn't dropped within its task execution
// panics when the execution completes, which aborts the process. ---

const LEAK_MESSAGE: &str =
    "`KeyedReadRef` or `LazyReadRef` was not dropped within the task execution";
const ORIGINAL_ERROR: &str = "original task error";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Leak {
    /// Moved to a different (non-turbo-tasks) thread and dropped there.
    OtherThread,
    /// Never dropped.
    Forgotten,
    /// The `LazyReadRef` is moved out of the task, then accessed and dropped by another task.
    RefMovedOut,
    /// The `lazy_reader()` future is moved out of the task (to be awaited elsewhere).
    FutureMovedOut,
    /// Not leaked: the task returns an error while the `LazyReadRef` is alive, so it's dropped
    /// when the error is returned (still within the execution).
    ErrorWhileAlive,
    /// Not leaked: the task panics while the `LazyReadRef` is alive, so it's dropped while
    /// unwinding (still within the execution).
    PanicWhileAlive,
}

const LEAKS: [Leak; 6] = [
    Leak::OtherThread,
    Leak::Forgotten,
    Leak::RefMovedOut,
    Leak::FutureMovedOut,
    Leak::ErrorWhileAlive,
    Leak::PanicWhileAlive,
];

/// Where [`Leak::RefMovedOut`] moves the `LazyReadRef` to.
static MOVED_OUT_REF: Mutex<Option<LazyReadRef<Value>>> = Mutex::new(None);
/// Where [`Leak::FutureMovedOut`] moves the future to.
static MOVED_OUT_FUTURE: Mutex<Option<PendingLazyReadFuture>> = Mutex::new(None);
/// Notified when [`MOVED_OUT_REF`] or [`MOVED_OUT_FUTURE`] is set.
static MOVED_OUT_READY: tokio::sync::Notify = tokio::sync::Notify::const_new();
/// Notified when another task used the moved-out ref or future.
static MOVED_OUT_USED: tokio::sync::Notify = tokio::sync::Notify::const_new();

/// Never accesses the value. `leak` is an index into [`LEAKS`].
#[turbo_tasks::function(operation, root)]
async fn leak_lazy(
    value: OperationVc<Value>,
    leak: u8,
    executions: ResolvedVc<Executions>,
) -> Result<Vc<ReadResult>> {
    let leak = LEAKS[leak as usize];
    // Count executions untracked so this doesn't create a dependency.
    let executions = executions.untracked().await?;
    // Don't hold the guard of `get_untracked` while setting the state.
    let count = *executions.get_untracked() + 1;
    executions.set(count);
    let value = value.connect();
    if leak == Leak::FutureMovedOut {
        *MOVED_OUT_FUTURE.lock().unwrap() = Some(Box::pin(value.lazy_reader()));
        // Keep this execution running until another task awaited the future.
        MOVED_OUT_READY.notify_one();
        MOVED_OUT_USED.notified().await;
    } else {
        let lazy = value.lazy_reader().await?;
        match leak {
            Leak::OtherThread => std::thread::spawn(move || drop(lazy)).join().unwrap(),
            Leak::Forgotten => std::mem::forget(lazy),
            Leak::RefMovedOut => {
                *MOVED_OUT_REF.lock().unwrap() = Some(lazy);
                // Keep this execution running until another task used the ref.
                MOVED_OUT_READY.notify_one();
                MOVED_OUT_USED.notified().await;
            }
            Leak::FutureMovedOut => unreachable!(),
            Leak::ErrorWhileAlive => {
                let _lazy = lazy;
                anyhow::bail!("{ORIGINAL_ERROR}");
            }
            Leak::PanicWhileAlive => {
                let _lazy = lazy;
                panic!("{ORIGINAL_ERROR}");
            }
        }
    }
    Ok(ReadResult {
        value: None,
        random: rand::random(),
    }
    .cell())
}

/// Runs [`leak_lazy`] with `leak` and returns its first result plus what's needed to check it.
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

    let op = leak_lazy(
        create_value(state_vc),
        LEAKS.iter().position(|l| *l == leak).unwrap() as u8,
        executions_vc,
    );
    let result = op.read_strongly_consistent().await;
    Ok((result, state, executions, op))
}

/// Not leaked: the original error/panic is kept and the unaccessed read is canceled.
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
async fn lazy_read_ref_error_while_alive_keeps_error() {
    run(&REGISTRATION, async || {
        check_no_leak(Leak::ErrorWhileAlive).await
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_panic_while_alive_keeps_panic() {
    run(&REGISTRATION, async || {
        check_no_leak(Leak::PanicWhileAlive).await
    })
    .await
    .unwrap()
}

/// Selects the [`Leak`] case (an index into [`LEAKS`]) that [`lazy_read_ref_leak_child`] runs.
const LEAK_CASE_ENV: &str = "TURBO_TASKS_LAZY_READ_REF_LEAK_CASE";
const NO_ABORT_MESSAGE: &str = "lazy_read_ref_leak_child: the process didn't abort";

/// Accesses and drops the `LazyReadRef` that another task moved out ([`Leak::RefMovedOut`]).
#[turbo_tasks::function(root)]
async fn use_moved_out_ref() -> Result<Vc<ReadResult>> {
    let lazy = MOVED_OUT_REF
        .lock()
        .unwrap()
        .take()
        .context("nothing moved out")?;
    let value = Some(lazy.get().step);
    drop(lazy);
    Ok(ReadResult {
        value,
        random: rand::random(),
    }
    .cell())
}

/// Leaks abort the process, so they run in a child process (this test binary again, running only
/// this test). Without the env var, this test does nothing.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_leak_child() {
    let Ok(case) = std::env::var(LEAK_CASE_ENV) else {
        return;
    };
    let leak = LEAKS[case.parse::<usize>().unwrap()];
    // Bounded, so a missing abort can't hang the test (e.g. `run` also re-runs the closure with a
    // restored cache, where a missing abort would leave the moved-out future never set).
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        run(&REGISTRATION, move || async move {
            if matches!(leak, Leak::RefMovedOut | Leak::FutureMovedOut) {
                // Use the ref / await the future in a different task than the one that created
                // it, while the creating execution is still running.
                let use_moved_out = async {
                    MOVED_OUT_READY.notified().await;
                    let read = if leak == Leak::RefMovedOut {
                        use_moved_out_ref().strongly_consistent().await
                    } else {
                        let future = MOVED_OUT_FUTURE.lock().unwrap().take();
                        let pending = TransientInstance::new(PendingLazyRead(Mutex::new(future)));
                        poll_pending_lazy_read(pending).strongly_consistent().await
                    };
                    MOVED_OUT_USED.notify_one();
                    read?;
                    anyhow::Ok(())
                };
                let (leaked, used) = tokio::join!(run_leak(leak), use_moved_out);
                used?;
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
            "lazy_read_ref_leak_child",
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

/// The child processes share the persistent cache directory of [`lazy_read_ref_leak_child`], so
/// the cases run one after another.
#[test]
fn lazy_read_ref_leaks_abort() {
    for leak in [
        Leak::OtherThread,
        Leak::Forgotten,
        Leak::RefMovedOut,
        Leak::FutureMovedOut,
    ] {
        assert_leak_aborts(leak);
    }
}

// --- Reads outside of a task execution are plain reads. ---

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_outside_of_task() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);
        let value = create_value(state_vc)
            .resolve()
            .strongly_consistent()
            .await?;
        let lazy = value.lazy_reader().await?;
        assert_eq!(lazy.get().step, 1);
        let unaccessed = value.lazy_reader().await?;
        drop(unaccessed);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
