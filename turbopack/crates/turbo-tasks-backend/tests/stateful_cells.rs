#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)]

//! Real persistent-backend regressions for experimental task-owned stateful cells.
mod util;

use std::{
    collections::HashMap,
    sync::{
        LazyLock, Mutex,
        atomic::{AtomicU32, Ordering},
    },
    time::Duration,
};

use anyhow::{Result, bail};
use turbo_tasks::{Invalidator, OperationVc, RawVcUnpacked, StateCell, Vc, get_invalidator};

use crate::util::{create_tt, reopen_tt_with_gc};

static OWNER_RUNS: [AtomicU32; 16] = [const { AtomicU32::new(0) }; 16];
static READER_RUNS: [AtomicU32; 16] = [const { AtomicU32::new(0) }; 16];
static BEHAVIOR: [AtomicU32; 16] = [const { AtomicU32::new(0) }; 16];
static INVALIDATORS: LazyLock<Mutex<HashMap<u32, Invalidator>>> = LazyLock::new(Default::default);
type ReadGate = (
    tokio::sync::oneshot::Sender<()>,
    tokio::sync::oneshot::Receiver<()>,
);
static READ_GATE: Mutex<Option<ReadGate>> = Mutex::new(None);
static OWNER_GATES: LazyLock<Mutex<HashMap<u32, ReadGate>>> = LazyLock::new(Default::default);

fn invalidate_owner(id: u32, tt: &turbo_tasks::TurboTasks<turbo_tasks_backend::TurboTasksBackend>) {
    let invalidator = *INVALIDATORS.lock().unwrap().get(&id).unwrap();
    invalidator.invalidate(tt);
}

// Determinism verification repeats new tasks and output-changing executions
// before notifying strong readers. Equal-output invalidations may also schedule
// an additional verification run, depending on completion ordering.
fn expected_runs(committed_executions: u32) -> u32 {
    committed_executions
        * if cfg!(feature = "verify_determinism") {
            2
        } else {
            1
        }
}

#[turbo_tasks::value(cell = "stateful", operation)]
#[derive(Clone)]
struct Counter {
    value: u32,
}

#[turbo_tasks::value]
struct CounterHandle {
    state: Option<StateCell<Counter>>,
}

#[turbo_tasks::function(operation, root)]
async fn create_counter(id: u32) -> Result<Vc<CounterHandle>> {
    OWNER_RUNS[id as usize].fetch_add(1, Ordering::SeqCst);
    INVALIDATORS
        .lock()
        .unwrap()
        .insert(id, get_invalidator().unwrap());
    let gate = OWNER_GATES.lock().unwrap().remove(&id);
    if let Some((started, resume)) = gate {
        started.send(()).unwrap();
        resume.await.unwrap();
    }
    let behavior = BEHAVIOR[id as usize].load(Ordering::SeqCst);
    if behavior == 3 {
        bail!("deliberate creator failure before allocation")
    }
    let state = if behavior == 2 {
        None
    } else {
        let cell = Counter {
            value: if behavior == 1 { 99 } else { 0 },
        }
        .stateful_cell();
        if behavior == 4 {
            assert!(cell.set(Counter { value: 100 }).is_err());
            assert!(cell.update(|v| v.value += 1).is_err());
        }
        Some(cell)
    };
    Ok(CounterHandle { state }.cell())
}

#[turbo_tasks::function]
async fn read_counter(id: u32, state: StateCell<Counter>, tracked: bool) -> Result<Vc<u32>> {
    READER_RUNS[id as usize].fetch_add(1, Ordering::SeqCst);
    let gate = if id == 5 {
        READ_GATE.lock().unwrap().take()
    } else {
        None
    };
    if let Some((started, resume)) = gate {
        started.send(()).unwrap();
        resume.await.unwrap();
    }
    let value = if tracked {
        state.get()?
    } else {
        state.get_untracked()?
    };
    Ok(Vc::cell(value.value))
}

#[turbo_tasks::function(operation, root)]
async fn downstream(id: u32, state: StateCell<Counter>, tracked: bool) -> Result<Vc<u32>> {
    Ok(Vc::cell(*read_counter(id, state, tracked).await? * 2))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn tracked_untracked_and_immutable_snapshots() {
    let (tt, _dir) = create_tt("stateful_snapshots");
    turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(0)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        let old = state.get()?;
        assert_eq!(
            *downstream(0, state, true)
                .read_strongly_consistent()
                .await?,
            0
        );
        assert_eq!(
            *downstream(1, state, false)
                .read_strongly_consistent()
                .await?,
            0
        );
        state.set(Counter { value: 1 })?;
        assert_eq!(old.value, 0);
        assert_eq!(state.get()?.value, 1);
        assert_eq!(
            *downstream(0, state, true)
                .read_strongly_consistent()
                .await?,
            2
        );
        assert_eq!(
            *downstream(1, state, false)
                .read_strongly_consistent()
                .await?,
            0
        );
        assert_eq!(READER_RUNS[0].load(Ordering::SeqCst), expected_runs(2));
        assert_eq!(READER_RUNS[1].load(Ordering::SeqCst), expected_runs(1));
        state.update(|_| {})?;
        assert_eq!(
            *downstream(0, state, true)
                .read_strongly_consistent()
                .await?,
            2
        );
        let equal_runs = READER_RUNS[0].load(Ordering::SeqCst);
        assert!(
            (expected_runs(2) + 1..=expected_runs(3)).contains(&equal_runs),
            "equal-value commit must reexecute once (plus an optional verification rerun): \
             {equal_runs}"
        );
        assert_eq!(
            OWNER_RUNS[0].load(Ordering::SeqCst),
            expected_runs(1),
            "external mutation does not rerun its owner"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn canonical_mutation_after_eviction_and_restart() {
    let (tt, dir) = create_tt("stateful_restart");
    let (state, old) = turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(2)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        let old = state.get_untracked()?;
        state.set(Counter { value: 7 })?;
        anyhow::Ok((state, old))
    })
    .await
    .unwrap();
    let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
    assert!(outcome.had_new_data);
    assert!(
        outcome.eviction_counts.data_and_meta > 0,
        "must actually evict owner: {:?}",
        outcome.eviction_counts
    );
    turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(state.get_untracked()?.value, 7);
        state.update(|v| v.value += 1)?;
        assert_eq!(old.value, 0, "detached snapshot cannot mutate live storage");
        assert_eq!(state.get_untracked()?.value, 8);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    let tt = reopen_tt_with_gc(&dir);
    turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(2)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(state.get_untracked()?.value, 8);
        assert_eq!(
            OWNER_RUNS[2].load(Ordering::SeqCst),
            expected_runs(1),
            "owner restored without initializer rerun"
        );
        state.set(Counter { value: 9 })?;
        assert_eq!(state.get_untracked()?.value, 9);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_writers_and_release_reentrancy_panic_recovery() {
    let (tt, _dir) = create_tt("stateful_writers");
    let state = turbo_tasks::run_once(tt.clone(), async move {
        anyhow::Ok(
            create_counter(3)
                .read_strongly_consistent()
                .await?
                .state
                .unwrap(),
        )
    })
    .await
    .unwrap();
    let mut writers = Vec::new();
    for _ in 0..2 {
        let tt = tt.clone();
        writers.push(tokio::spawn(async move {
            turbo_tasks::run_once(tt, async move {
                for _ in 0..100 {
                    state.update(|v| v.value += 1)?;
                }
                anyhow::Ok(())
            })
            .await
            .unwrap();
        }));
    }
    tokio::time::timeout(Duration::from_secs(15), async {
        for writer in writers {
            writer.await.unwrap();
        }
    })
    .await
    .unwrap();
    turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(state.get_untracked()?.value, 200);
        let panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            state
                .update(|v| {
                    v.value = 999;
                    panic!("discard private clone")
                })
                .unwrap();
        }));
        assert!(panic.is_err());
        assert_eq!(state.get_untracked()?.value, 200);
        for action in 0..5 {
            let panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                state
                    .update(|_| match action {
                        0 => {
                            let _ = state.get();
                        }
                        1 => {
                            let _ = state.set(Counter { value: 300 });
                        }
                        2 => {
                            let _ = state.update(|v| v.value += 1);
                        }
                        3 => {
                            let _ = Vc::<u32>::cell(1);
                        }
                        _ => {
                            let _ = number(5);
                        }
                    })
                    .unwrap();
            }));
            assert!(
                panic.is_err(),
                "reentrant action {action} must fail before locks"
            );
        }
        state.update(|v| v.value += 1)?;
        assert_eq!(state.get_untracked()?.value, 201);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    assert!(
        tt.backend()
            .snapshot_and_evict_for_testing(&tt)
            .had_new_data
    );
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn creator_reexecution_first_value_wins_failure_preserves_and_success_retires() {
    let (tt, dir) = create_tt("stateful_retirement");
    let state = turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(4)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        state.set(Counter { value: 17 })?;
        anyhow::Ok(state)
    })
    .await
    .unwrap();
    turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(
            *downstream(4, state, true)
                .read_strongly_consistent()
                .await?,
            34
        );
        assert_eq!(
            load_retired_identity()
                .read_strongly_consistent()
                .await?
                .state
                .unwrap(),
            state
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    for behavior in [1, 4, 3, 2] {
        BEHAVIOR[4].store(behavior, Ordering::SeqCst);
        invalidate_owner(4, &tt);
        turbo_tasks::run_once(tt.clone(), async move {
            let result = create_counter(4).read_strongly_consistent().await;
            if behavior == 3 {
                assert!(result.is_err());
                assert_eq!(
                    state.get_untracked()?.value,
                    17,
                    "failed execution preserves slots"
                );
            } else if behavior == 2 {
                assert!(result?.state.is_none());
                assert!(state.get_untracked().is_err());
                assert!(state.set(Counter { value: 999 }).is_err());
                assert!(state.update(|v| v.value += 1).is_err());
                assert!(
                    downstream(4, state, true)
                        .read_strongly_consistent()
                        .await
                        .is_err(),
                    "cached tracked reader must observe retirement, not return stale clean data"
                );
            } else {
                assert_eq!(result?.state.unwrap(), state);
                assert_eq!(state.get_untracked()?.value, 17);
            }
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
    // The untracked root holder persisted the identity before retirement.
    tt.stop_and_wait().await;
    let tt = reopen_tt_with_gc(&dir);
    turbo_tasks::run_once(tt.clone(), async move {
        assert!(
            create_counter(4)
                .read_strongly_consistent()
                .await?
                .state
                .is_none()
        );
        // Reacquire persisted identity in this backend, never reuse a previous-session TaskId.
        let old = load_retired_identity().read_strongly_consistent().await?;
        let state = old
            .state
            .expect("persisted holder must contain the retired identity");
        assert!(state.get_untracked().is_err());
        assert!(state.set(Counter { value: 999 }).is_err());
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

// Freeze the original identity before retirement without depending on the
// creator's output. This is a rooted, fixed-layout test fixture, not a state API.
#[turbo_tasks::function(operation, root)]
async fn load_retired_identity() -> Result<Vc<CounterHandle>> {
    let state = create_counter(4).connect().untracked().await?.state;
    assert!(state.is_some());
    Ok(CounterHandle { state }.cell())
}

#[turbo_tasks::value(cell = "stateful", operation)]
#[derive(Clone)]
struct OperationState {
    operation: OperationVc<u32>,
}
#[turbo_tasks::value]
struct OperationHandle {
    state: StateCell<OperationState>,
}
#[turbo_tasks::function(operation)]
fn number(value: u32) -> Vc<u32> {
    Vc::cell(value)
}
#[turbo_tasks::function(operation, root)]
fn create_operation_state() -> Vc<OperationHandle> {
    OperationHandle {
        state: OperationState {
            operation: number(1),
        }
        .stateful_cell(),
    }
    .cell()
}
#[turbo_tasks::function(operation, root)]
async fn read_operation(state: StateCell<OperationState>) -> Result<Vc<u32>> {
    let operation = state.get()?.operation;
    Ok(Vc::cell(*operation.connect().await?))
}
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn operation_payload_strong_consistency() {
    let (tt, _dir) = create_tt("stateful_operations");
    tokio::time::timeout(
        Duration::from_secs(15),
        turbo_tasks::run_once(tt.clone(), async move {
            let state = create_operation_state()
                .read_strongly_consistent()
                .await?
                .state;
            assert_eq!(*read_operation(state).read_strongly_consistent().await?, 1);
            state.set(OperationState {
                operation: number(2),
            })?;
            assert_eq!(*read_operation(state).read_strongly_consistent().await?, 2);
            anyhow::Ok(())
        }),
    )
    .await
    .unwrap()
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn reader_registered_after_snapshot_survives_restart() {
    let (tt, dir) = create_tt("stateful_persisted_reader");
    let state = turbo_tasks::run_once(tt.clone(), async move {
        anyhow::Ok(
            create_counter(6)
                .read_strongly_consistent()
                .await?
                .state
                .unwrap(),
        )
    })
    .await
    .unwrap();
    assert!(
        tt.backend()
            .snapshot_and_evict_for_testing(&tt)
            .had_new_data
    );
    turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(
            *downstream(6, state, true)
                .read_strongly_consistent()
                .await?,
            0
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    assert!(
        tt.backend()
            .snapshot_and_evict_for_testing(&tt)
            .had_new_data
    );
    tt.stop_and_wait().await;
    let tt = reopen_tt_with_gc(&dir);
    turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(6)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(
            *downstream(6, state, true)
                .read_strongly_consistent()
                .await?,
            0
        );
        assert_eq!(
            READER_RUNS[6].load(Ordering::SeqCst),
            expected_runs(1),
            "restore must reuse persisted reader"
        );
        state.set(Counter { value: 9 })?;
        assert_eq!(
            *downstream(6, state, true)
                .read_strongly_consistent()
                .await?,
            18
        );
        assert_eq!(READER_RUNS[6].load(Ordering::SeqCst), expected_runs(2));
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[turbo_tasks::value]
struct CellLocation {
    cell: turbo_tasks::ResolvedVc<u32>,
}
#[turbo_tasks::function(operation, root)]
async fn reader_location(state: StateCell<Counter>) -> Result<Vc<CellLocation>> {
    Ok(CellLocation {
        cell: read_counter(5, state, true).to_resolved().await?,
    }
    .cell())
}
#[turbo_tasks::function(operation, root)]
async fn force_clean_recompute(state: StateCell<Counter>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*read_counter(5, state, true).await?))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn clean_recomputation_becomes_dirty_before_consuming_changed_cell() {
    let (tt, _dir) = create_tt("stateful_clean_recompute");
    let (state, producer, cell) = turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(5)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(
            *downstream(5, state, true)
                .read_strongly_consistent()
                .await?,
            0
        );
        let location = reader_location(state).read_strongly_consistent().await?;
        let RawVcUnpacked::TaskCell(producer, cell) = Vc::into_raw(*location.cell).unpack() else {
            panic!("expected task cell")
        };
        anyhow::Ok((state, producer, cell))
    })
    .await
    .unwrap();
    assert!(!tt.backend().is_dirty_for_testing(producer, &tt));
    tt.backend().remove_cell_for_testing(producer, cell, &tt);
    let (started, at_read) = tokio::sync::oneshot::channel();
    let (resume, resumed) = tokio::sync::oneshot::channel();
    *READ_GATE.lock().unwrap() = Some((started, resumed));
    let tt_reader = tt.clone();
    let reader = tokio::spawn(async move {
        turbo_tasks::run_once(tt_reader, async move {
            anyhow::Ok(
                *force_clean_recompute(state)
                    .read_strongly_consistent()
                    .await?,
            )
        })
        .await
    });
    tokio::time::timeout(Duration::from_secs(15), at_read)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !tt.backend().is_dirty_for_testing(producer, &tt),
        "missing content starts a clean recomputation"
    );
    let tt_writer = tt.clone();
    turbo_tasks::run_once(tt_writer, async move {
        state.set(Counter { value: 10 })?;
        anyhow::Ok(())
    })
    .await
    .unwrap();
    let dirty = tt.backend().is_dirty_for_testing(producer, &tt);
    resume.send(()).unwrap(); // Release the fixture even if the invariant below fails.
    assert!(
        dirty,
        "external writes must dirty a clean in-progress reader before it consumes new content"
    );
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(15), reader)
            .await
            .unwrap()
            .unwrap()
            .unwrap(),
        10
    );
    turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(
            *downstream(5, state, true)
                .read_strongly_consistent()
                .await?,
            20
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[turbo_tasks::function]
fn unrooted_counter() -> Vc<CounterHandle> {
    CounterHandle {
        state: Some(Counter { value: 0 }.stateful_cell()),
    }
    .cell()
}
#[turbo_tasks::value]
struct GcHandle {
    state: Option<StateCell<Counter>>,
    owner: u32,
}
#[turbo_tasks::function(operation, root)]
async fn select_unrooted_counter() -> Result<Vc<GcHandle>> {
    INVALIDATORS
        .lock()
        .unwrap()
        .insert(7, get_invalidator().unwrap());
    if BEHAVIOR[7].load(Ordering::SeqCst) == 0 {
        let vc = unrooted_counter().resolve().await?;
        let owner = *Vc::into_raw(vc).try_get_task_id().unwrap();
        Ok(GcHandle {
            state: vc.await?.state,
            owner,
        }
        .cell())
    } else {
        Ok(GcHandle {
            state: None,
            owner: 0,
        }
        .cell())
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn explicit_pin_prevents_collection_then_old_handles_fail() {
    let (tt, _dir) = create_tt("stateful_gc");
    let (state, owner) = turbo_tasks::run_once(tt.clone(), async move {
        let selected = select_unrooted_counter().read_strongly_consistent().await?;
        let state = selected.state.unwrap();
        let owner = turbo_tasks::TaskId::try_from(selected.owner)?;
        anyhow::Ok((state, owner))
    })
    .await
    .unwrap();
    tt.pin_task_for_gc(owner);
    BEHAVIOR[7].store(1, Ordering::SeqCst);
    invalidate_owner(7, &tt);
    turbo_tasks::run_once(tt.clone(), async move {
        assert!(
            select_unrooted_counter()
                .read_strongly_consistent()
                .await?
                .state
                .is_none()
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    assert_eq!(
        tt.backend().gc_for_testing(&tt),
        0,
        "pin retains the disconnected owner"
    );
    turbo_tasks::run_once(tt.clone(), async move {
        state.set(Counter { value: 23 })?;
        assert_eq!(state.get_untracked()?.value, 23);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.unpin_task_for_gc(owner);
    assert_eq!(
        tt.backend().gc_for_testing(&tt),
        1,
        "must actually collect owner after unpin"
    );
    turbo_tasks::run_once(tt.clone(), async move {
        assert!(state.get().is_err());
        assert!(state.get_untracked().is_err());
        assert!(state.set(Counter { value: 0 }).is_err());
        assert!(state.update(|v| v.value += 1).is_err());
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[turbo_tasks::value]
struct OwnerLocation {
    cell: turbo_tasks::ResolvedVc<CounterHandle>,
}
#[turbo_tasks::function(operation, root)]
async fn owner_location(id: u32) -> Result<Vc<OwnerLocation>> {
    Ok(OwnerLocation {
        cell: create_counter(id).connect().to_resolved().await?,
    }
    .cell())
}
#[turbo_tasks::function(operation, root)]
async fn force_owner_recompute(id: u32) -> Result<Vc<CounterHandle>> {
    let state = create_counter(id).connect().await?.state;
    Ok(CounterHandle { state }.cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn clean_creator_failure_and_cancellation_preserve_canonical_state() {
    use turbo_tasks::backend::Backend;
    let (tt, dir) = create_tt("stateful_failed_clean_creator");
    let (state, owner, ordinary_cell) = turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(9)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        state.set(Counter { value: 17 })?;
        let location = owner_location(9).read_strongly_consistent().await?;
        let RawVcUnpacked::TaskCell(owner, cell) = Vc::into_raw(*location.cell).unpack() else {
            panic!("expected task cell")
        };
        anyhow::Ok((state, owner, cell))
    })
    .await
    .unwrap();
    BEHAVIOR[9].store(3, Ordering::SeqCst);
    tt.backend()
        .remove_cell_for_testing(owner, ordinary_cell, &tt);
    assert!(!tt.backend().is_dirty_for_testing(owner, &tt));
    turbo_tasks::run_once(tt.clone(), async move {
        assert!(
            force_owner_recompute(9)
                .read_strongly_consistent()
                .await
                .is_err()
        );
        assert_eq!(
            state.get_untracked()?.value,
            17,
            "failed clean recomputation preserves stateful slots"
        );
        state.update(|v| v.value += 1)?;
        anyhow::Ok(())
    })
    .await
    .unwrap();
    // Exercise the same cancellation notification the runner uses for queued
    // tasks at shutdown. It must preserve the canonical slot and mark the owner
    // session-dependent so the next backend can execute it again.
    Backend::task_execution_canceled(tt.backend(), owner, &tt);
    turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(state.get_untracked()?.value, 18);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    BEHAVIOR[9].store(0, Ordering::SeqCst);
    let tt = reopen_tt_with_gc(&dir);
    turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(9)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(
            state.get_untracked()?.value,
            18,
            "cancellation/restart must not reinitialize"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn creator_execution_races_external_update_without_reset() {
    let (tt, _dir) = create_tt("stateful_creator_writer_race");
    let (state, owner_id) = turbo_tasks::run_once(tt.clone(), async move {
        let operation = create_counter(10);
        let owner = operation.task_id();
        anyhow::Ok((
            operation.read_strongly_consistent().await?.state.unwrap(),
            owner,
        ))
    })
    .await
    .unwrap();
    for behavior in [1, 2] {
        let (entered, at_update) = tokio::sync::oneshot::channel();
        let (finish_update, finish) = std::sync::mpsc::channel();
        let writer_tt = tt.clone();
        let writer = tokio::spawn(async move {
            turbo_tasks::run_once(writer_tt, async move {
                state.update(|v| {
                    entered.send(()).unwrap();
                    finish.recv_timeout(Duration::from_secs(15)).unwrap();
                    v.value = 41;
                })?;
                anyhow::Ok(())
            })
            .await
        });
        tokio::time::timeout(Duration::from_secs(15), at_update)
            .await
            .unwrap()
            .unwrap();
        let (started, owner_executing) = tokio::sync::oneshot::channel();
        let (resume, resumed) = tokio::sync::oneshot::channel();
        OWNER_GATES.lock().unwrap().insert(10, (started, resumed));
        BEHAVIOR[10].store(behavior, Ordering::SeqCst); // different initializer, then omission
        invalidate_owner(10, &tt);
        let owner_tt = tt.clone();
        let owner_read = tokio::spawn(async move {
            turbo_tasks::run_once(owner_tt, async move {
                anyhow::Ok(create_counter(10).read_strongly_consistent().await?.state)
            })
            .await
        });
        tokio::time::timeout(Duration::from_secs(15), owner_executing)
            .await
            .unwrap()
            .unwrap();
        // Owner execution has begun while the external transaction holds the slot.
        // No task work is awaited inside the update; both gates are plain test signals.
        resume.send(()).unwrap();
        let registered = tokio::time::timeout(Duration::from_secs(15), async {
            while tt.backend().stateful_waiters_for_testing(owner_id) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await;
        finish_update.send(()).unwrap();
        assert!(
            registered.is_ok(),
            "owner initialization/completion must actually wait on the external writer"
        );
        writer.await.unwrap().unwrap();
        let same_state = tokio::time::timeout(Duration::from_secs(15), owner_read)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        if behavior == 1 {
            assert_eq!(same_state, Some(state));
            turbo_tasks::run_once(tt.clone(), async move {
                assert_eq!(
                    state.get_untracked()?.value,
                    41,
                    "initializer cannot overwrite external commit"
                );
                state.update(|v| v.value += 1)?;
                assert_eq!(state.get_untracked()?.value, 42);
                anyhow::Ok(())
            })
            .await
            .unwrap();
        } else {
            assert!(same_state.is_none());
            turbo_tasks::run_once(tt.clone(), async move {
                assert!(
                    state.get_untracked().is_err(),
                    "completion must retire after the in-flight write finishes"
                );
                assert!(
                    state.set(Counter { value: 999 }).is_err(),
                    "late writes must not resurrect the omitted slot"
                );
                anyhow::Ok(())
            })
            .await
            .unwrap();
        }
    }
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn no_context_access_and_ordinary_constructor_backdoors_fail() {
    let (tt, _dir) = create_tt("stateful_context");
    let state = turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(11)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        for action in 0..3 {
            let panic = std::panic::catch_unwind(|| match action {
                0 => {
                    let _ = Vc::<Counter>::cell_private(Counter { value: 0 });
                }
                1 => {
                    let _ = Counter { value: 0 }.stateful_cell();
                } // transient Once Task cannot own persistable state
                _ => {
                    let _ = StateCell::<u32>::cell_private(0);
                }
            });
            assert!(panic.is_err());
        }
        let encoded = bincode::encode_to_vec(state, bincode::config::standard())?;
        let (wrong, _): (StateCell<OperationState>, usize) =
            bincode::decode_from_slice(&encoded, bincode::config::standard())?;
        assert!(wrong.get().is_err());
        assert!(
            wrong
                .set(OperationState {
                    operation: number(2)
                })
                .is_err(),
            "a mistyped decoded handle must not corrupt another cell's payload"
        );
        assert_eq!(state.get_untracked()?.value, 0);
        let other = create_counter(12)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_ne!(
            state, other,
            "construction in a different task creates a different single-owner identity"
        );
        anyhow::Ok(state)
    })
    .await
    .unwrap();
    assert!(state.get().is_err());
    assert!(state.get_untracked().is_err());
    assert!(state.set(Counter { value: 2 }).is_err());
    assert!(state.update(|v| v.value += 1).is_err());
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn snapshot_waits_for_admitted_update_and_persists_dirty_readers() {
    let (tt, dir) = create_tt("stateful_update_before_cut");
    let state = turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(13)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(
            *downstream(13, state, true)
                .read_strongly_consistent()
                .await?,
            0
        );
        anyhow::Ok(state)
    })
    .await
    .unwrap();
    let (entered, in_update) = tokio::sync::oneshot::channel();
    let (finish_update, finish) = std::sync::mpsc::channel();
    let tt_writer = tt.clone();
    let writer = tokio::spawn(async move {
        turbo_tasks::run_once(tt_writer, async move {
            state.update(|value| {
                entered.send(()).unwrap();
                finish.recv_timeout(Duration::from_secs(15)).unwrap();
                value.value = 5;
            })?;
            anyhow::Ok(())
        })
        .await
    });
    tokio::time::timeout(Duration::from_secs(15), in_update)
        .await
        .unwrap()
        .unwrap();
    let tt_snapshot = tt.clone();
    let snapshot = tokio::task::spawn_blocking(move || {
        tt_snapshot
            .backend()
            .snapshot_and_evict_for_testing(&tt_snapshot)
    });
    let waiting = tokio::time::timeout(Duration::from_secs(15), async {
        while !tt.backend().snapshot_is_waiting_for_testing() {
            tokio::task::yield_now().await;
        }
    })
    .await;
    // Always release the writer, including on a failed checkpoint.
    finish_update.send(()).unwrap();
    assert!(
        waiting.is_ok(),
        "snapshot must wait for the admitted mutation, not cut its private clone"
    );
    writer.await.unwrap().unwrap();
    let outcome = tokio::time::timeout(Duration::from_secs(15), snapshot)
        .await
        .unwrap()
        .unwrap();
    assert!(outcome.had_new_data);
    // Freeze this cut before strong reading can execute/persist the dirty reader.
    let snapshot_dir = util::create_persistence_dir("stateful_update_before_cut_copy");
    copy_snapshot_dir(dir.path(), snapshot_dir.path());
    let restored = reopen_tt_with_gc(&snapshot_dir);
    turbo_tasks::run_once(restored.clone(), async move {
        let state = create_counter(13)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(state.get_untracked()?.value, 5);
        assert_eq!(
            *downstream(13, state, true)
                .read_strongly_consistent()
                .await?,
            10,
            "reader cannot restore clean with stale 0"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    restored.stop_and_wait().await;
    tt.stop_and_wait().await;
}

fn copy_snapshot_dir(source: &std::path::Path, target: &std::path::Path) {
    std::fs::create_dir_all(target).unwrap();
    for entry in std::fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let dest = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_snapshot_dir(&entry.path(), &dest);
        } else {
            std::fs::copy(entry.path(), dest).unwrap();
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn snapshot_cut_during_update_preserves_frozen_data_and_skips_eviction() {
    let (tt, dir) = create_tt("stateful_snapshot_cut");
    let frozen_dir = util::create_persistence_dir("stateful_frozen_snapshot");
    let (state, owner) = turbo_tasks::run_once(tt.clone(), async move {
        let operation = create_counter(8);
        let owner = operation.task_id();
        let state = operation.read_strongly_consistent().await?.state.unwrap();
        state.set(Counter { value: 3 })?;
        assert_eq!(
            *downstream(8, state, true)
                .read_strongly_consistent()
                .await?,
            6
        );
        anyhow::Ok((state, owner))
    })
    .await
    .unwrap();
    let (after_cut, start_writer) = tokio::sync::oneshot::channel();
    let (entered, in_update) = std::sync::mpsc::channel();
    let (finish_update, finish) = std::sync::mpsc::channel();
    let tt_writer = tt.clone();
    let writer = tokio::spawn(async move {
        start_writer.await.unwrap();
        turbo_tasks::run_once(tt_writer, async move {
            state.update(|v| {
                entered.send(()).unwrap();
                finish.recv_timeout(Duration::from_secs(15)).unwrap();
                v.value = 4;
            })?;
            anyhow::Ok(())
        })
        .await
    });
    let tt_snapshot = tt.clone();
    let snapshot = tokio::task::spawn_blocking(move || {
        tt_snapshot
            .backend()
            .snapshot_and_evict_with_callback_for_testing(&tt_snapshot, || {
                after_cut.send(()).unwrap();
                in_update.recv_timeout(Duration::from_secs(15)).unwrap();
            })
    });
    let outcome = tokio::time::timeout(Duration::from_secs(15), snapshot)
        .await
        .unwrap()
        .unwrap();
    // No background persistence is enabled. Copy the complete frozen database
    // before releasing the update, so reopening cannot see a later shutdown cut.
    let owner_stayed_restored = tt.backend().is_task_restored_for_testing(owner);
    copy_snapshot_dir(dir.path(), frozen_dir.path());
    let reader_tt = tt.clone();
    let (reading, before_get) = tokio::sync::oneshot::channel();
    let reader = tokio::spawn(async move {
        turbo_tasks::run_once(reader_tt, async move {
            reading.send(()).unwrap();
            anyhow::Ok(state.get_untracked()?.value)
        })
        .await
    });
    before_get.await.unwrap();
    let registered = tokio::time::timeout(Duration::from_secs(15), async {
        while tt.backend().stateful_waiters_for_testing(owner) == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await;
    finish_update.send(()).unwrap();
    assert!(
        registered.is_ok(),
        "get must actually register a wait during the update, not merely start its future"
    );
    writer.await.unwrap().unwrap();
    assert!(outcome.had_new_data);
    assert!(
        owner_stayed_restored,
        "reserved owner must not lose restored canonical storage during eviction"
    );
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(15), reader)
            .await
            .unwrap()
            .unwrap()
            .unwrap(),
        4
    );
    let frozen = reopen_tt_with_gc(&frozen_dir);
    turbo_tasks::run_once(frozen.clone(), async move {
        let state = create_counter(8)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(state.get_untracked()?.value, 3);
        assert_eq!(
            *downstream(8, state, true)
                .read_strongly_consistent()
                .await?,
            6
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    frozen.stop_and_wait().await;
    tt.stop_and_wait().await;
    let tt = reopen_tt_with_gc(&dir);
    turbo_tasks::run_once(tt.clone(), async move {
        let state = create_counter(8)
            .read_strongly_consistent()
            .await?
            .state
            .unwrap();
        assert_eq!(state.get_untracked()?.value, 4);
        assert_eq!(
            *downstream(8, state, true)
                .read_strongly_consistent()
                .await?,
            8
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}
