#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Tests for `Vc::keyed()` / `KeyedReadRef`: a single read of a keyed cell that afterwards only
//! depends on the keys that were actually accessed.

use std::sync::Mutex;

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use turbo_tasks::{OperationVc, ReadKeyedRefVcFuture, ResolvedVc, State, TransientInstance, Vc};
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
    /// Only `keyed()`.
    Keyed,
    /// Full read before `keyed()`.
    FullBefore,
    /// Full read while the `KeyedReadRef` is alive.
    FullWhileAlive,
    /// Two `KeyedReadRef`s alive at the same time, accessing different keys.
    TwoRefs,
    /// The `KeyedReadRef` is returned out of a spawned (non-local) task scope, i.e. it is dropped
    /// outside of the creating task execution: keep the conservative dependency.
    Leaked,
}

const MODES: [Mode; 5] = [
    Mode::Keyed,
    Mode::FullBefore,
    Mode::FullWhileAlive,
    Mode::TwoRefs,
    Mode::Leaked,
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
            let keyed = map.keyed().await?;
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
        }
        Mode::FullBefore => {
            let full = map.await?;
            let _ = full.len();
            let keyed = map.keyed().await?;
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
        }
        Mode::FullWhileAlive => {
            let keyed = map.keyed().await?;
            let full = map.await?;
            let _ = full.len();
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
        }
        Mode::TwoRefs => {
            let keyed1 = map.keyed().await?;
            let keyed2 = map.keyed().await?;
            for (i, key) in keys.iter().enumerate() {
                let keyed = if i % 2 == 0 { &keyed1 } else { &keyed2 };
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
            drop(keyed1);
            drop(keyed2);
        }
        Mode::Leaked => {
            let keyed = map.keyed().await?;
            for key in &keys {
                values.push(keyed.get(key).copied());
                contains.push(keyed.contains_key(key));
            }
            // Drop it on a different (non-turbo-tasks) thread, i.e. outside of this task
            // execution.
            std::thread::spawn(move || drop(keyed)).join().unwrap();
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
async fn keyed_read_ref_dropped_outside_task_keeps_dependency() {
    run(&REGISTRATION, async || check_mode(Mode::Leaked, true).await)
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
    let map = map.connect().keyed().await?;
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

// --- The `keyed()` future is created outside of the task that polls it. ---

struct PendingKeyedRead(Mutex<Option<ReadKeyedRefVcFuture<Map>>>);

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
        let map = create_map(state_vc).resolve().strongly_consistent().await?;

        // Created outside of any task, but polled within `poll_pending_keyed_read`, so that
        // task's dependency must be narrowed to `a`.
        let pending = TransientInstance::new(PendingKeyedRead(Mutex::new(Some(map.keyed()))));
        let read = poll_pending_keyed_read(pending);
        let r1 = read.strongly_consistent().await?;
        assert_eq!(r1.values, vec![Some(1)]);

        // Only `b` changes, which isn't accessed.
        state.set(2);
        let r2 = read.strongly_consistent().await?;
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

#[turbo_tasks::function(operation, root)]
async fn read_while_changing(
    map: OperationVc<Map>,
    step: ResolvedVc<Step>,
    executions: ResolvedVc<Executions>,
) -> Result<Vc<ReadResult>> {
    let map = map.connect();
    let keyed = map.keyed().await?;
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
