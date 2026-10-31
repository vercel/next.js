#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Tests for `Vc::lazy_reader()` / `LazyReadRef`: a read whose dependency is removed again when
//! the value is never accessed via `LazyReadRef::get`.

use std::{pin::Pin, sync::Mutex};

use anyhow::{Context, Result};
use futures::FutureExt;
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
}

const MODES: [Mode; 6] = [
    Mode::Lazy,
    Mode::TwoLazy,
    Mode::TwoLazyReverseDrop,
    Mode::FullBefore,
    Mode::FullWhileAlive,
    Mode::DroppedInDetached,
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

// --- Mixed with keyed reads of the same cell: only the keyed semantics remain. ---

#[turbo_tasks::function(operation, root)]
async fn read_lazy_and_keyed(map: OperationVc<Map>, batched: bool) -> Result<Vc<ReadResult>> {
    let map = map.connect();
    let lazy = map.lazy_reader().await?;
    let value = if batched {
        let keyed = map.keyed().await?;
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

// --- A `LazyReadRef` that isn't dropped within its task execution fails the task. ---

const LEAK_MESSAGE: &str =
    "`KeyedReadRef` or `LazyReadRef` was not dropped within the task execution";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Leak {
    /// Moved to a different (non-turbo-tasks) thread and dropped there.
    OtherThread,
    /// Never dropped.
    Forgotten,
}

const LEAKS: [Leak; 2] = [Leak::OtherThread, Leak::Forgotten];

/// Never accesses the value. `leak` is an index into [`LEAKS`].
#[turbo_tasks::function(operation, root)]
async fn leak_lazy(
    value: OperationVc<Value>,
    leak: u8,
    executions: ResolvedVc<Executions>,
) -> Result<Vc<ReadResult>> {
    let leak = LEAKS[leak as usize];
    let executions = executions.untracked().await?;
    let count = *executions.get_untracked() + 1;
    executions.set(count);
    let lazy = value.connect().lazy_reader().await?;
    match leak {
        // In debug builds, the drop on the other thread panics there. Ignore that, the task still
        // has to fail.
        Leak::OtherThread => {
            let _ = std::thread::spawn(move || drop(lazy)).join();
        }
        Leak::Forgotten => std::mem::forget(lazy),
    }
    Ok(ReadResult {
        value: None,
        random: rand::random(),
    }
    .cell())
}

async fn check_leak(leak: Leak) -> Result<()> {
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
    let check_error = |step: u32, err: anyhow::Error| {
        let message = format!("{err:?}");
        assert!(
            message.contains(LEAK_MESSAGE),
            "{leak:?} step {step}: expected the leak panic, got: {message}"
        );
    };
    check_error(
        1,
        op.read_strongly_consistent()
            .await
            .err()
            .expect("expected an error"),
    );
    let count1 = *executions.get_untracked();

    // The leaked ref's dependency is kept as a normal dependency, so the failed task
    // re-executes when the value changes.
    state.set(2);
    check_error(
        2,
        op.read_strongly_consistent()
            .await
            .err()
            .expect("expected an error"),
    );
    let count2 = *executions.get_untracked();
    assert!(count2 > count1, "{leak:?}: expected re-execution");
    anyhow::Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_dropped_on_other_thread_fails_task() {
    run(&REGISTRATION, async || check_leak(Leak::OtherThread).await)
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_forgotten_fails_task() {
    run(&REGISTRATION, async || check_leak(Leak::Forgotten).await)
        .await
        .unwrap()
}

// --- Using a `LazyReadRef` in a different task execution panics in debug builds. ---

const CROSS_EXECUTION_MESSAGE: &str = "used outside of the task execution";

struct Stash(Mutex<Option<LazyReadRef<Value>>>);

/// Moves the `LazyReadRef` out of the task. This task fails as it leaks the ref.
#[turbo_tasks::function(root)]
async fn stash_lazy(value: OperationVc<Value>, stash: TransientInstance<Stash>) -> Result<Vc<()>> {
    let lazy = value.connect().lazy_reader().await?;
    *stash.0.lock().unwrap() = Some(lazy);
    Ok(Vc::cell(()))
}

/// Uses a `LazyReadRef` from a different task execution: `get` (then drop) when `access`,
/// otherwise only drop.
#[turbo_tasks::function(root)]
async fn use_stashed_lazy(stash: TransientInstance<Stash>, access: bool) -> Result<Vc<ReadResult>> {
    let lazy = stash.0.lock().unwrap().take().context("nothing stashed")?;
    let value = access.then(|| lazy.get().step);
    drop(lazy);
    Ok(ReadResult { value, random: 0 }.cell())
}

type PendingLazyReadFuture = Pin<Box<dyn Future<Output = Result<LazyReadRef<Value>>> + Send>>;

struct PendingStash(Mutex<Option<PendingLazyReadFuture>>);

struct Gate(tokio::sync::Notify);

/// Only completes once the gate is opened.
#[turbo_tasks::function(root)]
async fn gated_value(gate: TransientInstance<Gate>) -> Result<Vc<Value>> {
    gate.0.notified().await;
    Ok(Value { step: 42 }.cell())
}

/// Polls a `lazy_reader()` future once (it's pending as the value is gated) and moves it out of
/// the task.
#[turbo_tasks::function(root)]
async fn stash_pending_lazy(
    gate: TransientInstance<Gate>,
    stash: TransientInstance<PendingStash>,
) -> Result<Vc<()>> {
    let mut future: PendingLazyReadFuture = Box::pin(gated_value(gate).lazy_reader());
    anyhow::ensure!(
        (&mut future).now_or_never().is_none(),
        "expected the read to be pending"
    );
    *stash.0.lock().unwrap() = Some(future);
    Ok(Vc::cell(()))
}

/// Continues polling a `lazy_reader()` future that was first polled in a different execution.
#[turbo_tasks::function(root)]
async fn poll_stashed_pending_lazy(
    gate: TransientInstance<Gate>,
    stash: TransientInstance<PendingStash>,
) -> Result<Vc<ReadResult>> {
    let future = stash.0.lock().unwrap().take().context("nothing stashed")?;
    gate.0.notify_one();
    let lazy = future.await?;
    let value = Some(lazy.get().step);
    Ok(ReadResult { value, random: 0 }.cell())
}

fn check_cross_execution(result: Result<impl Sized>, what: &str) {
    if cfg!(debug_assertions) {
        let message = format!(
            "{:?}",
            result
                .err()
                .unwrap_or_else(|| panic!("{what}: expected a panic"))
        );
        assert!(
            message.contains(CROSS_EXECUTION_MESSAGE),
            "{what}: expected the cross-execution panic, got: {message}"
        );
    } else if let Err(err) = result {
        panic!("{what}: expected no error in release builds, got: {err:?}");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_read_ref_used_in_other_execution() {
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);
        let value = create_value(state_vc);

        for access in [true, false] {
            let stash = TransientInstance::new(Stash(Mutex::new(None)));
            let leaked = stash_lazy(value, stash.clone()).strongly_consistent().await;
            let Err(err) = leaked else {
                panic!("expected the leak error");
            };
            let message = format!("{err:?}");
            assert!(message.contains(LEAK_MESSAGE), "got: {message}");
            let result = use_stashed_lazy(stash, access).strongly_consistent().await;
            check_cross_execution(result, if access { "get" } else { "drop" });
        }

        let gate = TransientInstance::new(Gate(tokio::sync::Notify::new()));
        let stash = TransientInstance::new(PendingStash(Mutex::new(None)));
        // Can't be read strongly consistent yet: the gated read is its child, and is only
        // completed once the gate is opened below.
        let stash_task = stash_pending_lazy(gate.clone(), stash.clone());
        let mut attempts = 0;
        while stash.0.lock().unwrap().is_none() {
            attempts += 1;
            anyhow::ensure!(attempts < 500, "the pending read was not stashed");
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        let result = poll_stashed_pending_lazy(gate, stash)
            .strongly_consistent()
            .await;
        if !cfg!(debug_assertions) {
            assert_eq!(result.as_ref().ok().and_then(|r| r.value), Some(42));
        }
        check_cross_execution(result, "poll");
        stash_task.strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await
    .unwrap()
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
