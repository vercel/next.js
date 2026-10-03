#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code does not respect this

mod util;

use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    ResolvedVc, StateOwner, StateOwnerRoot, StateSlot, TurboTasksState, Vc, turbo_tasks,
};
use turbo_tasks_testing::{Registration, register, run, run_without_cache_check};

use crate::util::{create_tt_with_gc_ttl, create_tt_without_gc, reopen_tt_with_gc};

static REGISTRATION: Registration = register!();

#[turbo_tasks::state]
static COUNTER: StateSlot<u32> = StateSlot::new();
#[turbo_tasks::state]
static SECOND_COUNTER: StateSlot<u32> = StateSlot::new();
#[turbo_tasks::state]
static TEXT_STATE: StateSlot<RcStr> = StateSlot::new();
#[turbo_tasks::state]
static COUNTED_STATE: StateSlot<Counted> = StateSlot::new();
static INITIAL_ENCODINGS: AtomicUsize = AtomicUsize::new(0);

#[derive(bincode::Decode)]
struct Counted(u32);

impl bincode::Encode for Counted {
    fn encode<E: bincode::enc::Encoder>(
        &self,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        INITIAL_ENCODINGS.fetch_add(1, Ordering::Relaxed);
        bincode::Encode::encode(&self.0, encoder)
    }
}
#[turbo_tasks::state]
static ENABLE: StateSlot<bool> = StateSlot::new();
static CONDITIONAL_RUNS: AtomicUsize = AtomicUsize::new(0);
static UNTRACKED_RUNS: AtomicUsize = AtomicUsize::new(0);
static CREATOR_REEXECUTIONS: AtomicUsize = AtomicUsize::new(0);

#[turbo_tasks::value(transparent)]
struct Counter(TurboTasksState<u32>);

#[turbo_tasks::value(transparent)]
struct Number(u32);

#[turbo_tasks::function(operation, root)]
fn create_counter() -> Vc<Counter> {
    let _ = turbo_tasks::get_invalidator();
    Counter(COUNTER.for_current_task(1)).cell()
}

#[turbo_tasks::function(operation, root)]
fn reexecuting_creator() -> Vc<Counter> {
    CREATOR_REEXECUTIONS.fetch_add(1, Ordering::Relaxed);
    let _ = turbo_tasks::get_invalidator();
    Counter(COUNTER.for_current_task(1)).cell()
}

#[turbo_tasks::function(operation, root)]
fn create_counter_for(id: u32) -> Vc<Counter> {
    Counter(COUNTER.for_current_task(id)).cell()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_transient_owner_makes_its_state_handle_a_transient_input() {
    let (tt, _dir) = create_tt_without_gc("transient_state_input");
    turbo_tasks::run_once(tt.clone(), async {
        let state = COUNTER.for_current_task(5);
        let reader = read_named_counter(state.clone());
        assert!(reader.task_id().is_transient());
        assert_eq!(*reader.read_strongly_consistent().await?, 5);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn task_owners_have_independent_state_for_the_same_slot() {
    run_without_cache_check(&REGISTRATION, async {
        let a = create_counter_for(10).read_strongly_consistent().await?;
        let b = create_counter_for(20).read_strongly_consistent().await?;
        assert_ne!(a.key(), b.key());
        a.set(11);
        assert_eq!(a.get_untracked(), 11);
        assert_eq!(b.get_untracked(), 20);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
async fn read_counter(counter: ResolvedVc<Counter>) -> Result<Vc<Number>> {
    let counter = counter.await?;
    Ok(Number(counter.get()).cell())
}

#[turbo_tasks::function(operation, root)]
fn conditional_reader(enabled: TurboTasksState<bool>, counter: TurboTasksState<u32>) -> Vc<Number> {
    CONDITIONAL_RUNS.fetch_add(1, Ordering::Relaxed);
    Number(if enabled.get() { counter.get() } else { 0 }).cell()
}

#[turbo_tasks::function(operation, root)]
fn untracked_reader(counter: TurboTasksState<u32>) -> Vc<Number> {
    UNTRACKED_RUNS.fetch_add(1, Ordering::Relaxed);
    Number(counter.get_untracked()).cell()
}

#[cfg(debug_assertions)]
#[turbo_tasks::state]
static REENTRANT_INITIALIZER: StateSlot<ReentrantInitializer> = StateSlot::new();

#[cfg(debug_assertions)]
#[derive(bincode::Decode)]
struct ReentrantInitializer(bool);

#[cfg(debug_assertions)]
impl bincode::Encode for ReentrantInitializer {
    fn encode<E: bincode::enc::Encoder>(
        &self,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        if self.0 {
            let _root = StateOwnerRoot::named("reentrant-state-codec".into());
        }
        bincode::Encode::encode(&self.0, encoder)
    }
}

#[cfg(debug_assertions)]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn state_initializer_reentrancy_is_rejected_and_store_recovers() {
    run_without_cache_check(&REGISTRATION, async {
        let root = StateOwnerRoot::named("initializer-reentrancy".into());
        let panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            REENTRANT_INITIALIZER.for_named_owner(&root, ReentrantInitializer(true));
        }))
        .expect_err("reentrant serializer was not rejected");
        let message = panic
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| panic.downcast_ref::<&str>().copied())
            .expect("panic did not contain a message");
        assert!(message.contains("must not call back into turbo-tasks"));
        // The vacant entry and mutation scope must unwind without poisoning
        // the canonical store or leaving the snapshot operation active.
        let state = REENTRANT_INITIALIZER.for_named_owner(&root, ReentrantInitializer(false));
        assert!(!state.get_untracked().0);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn existing_state_does_not_serialize_unused_initializer() {
    run_without_cache_check(&REGISTRATION, async {
        let root = StateOwnerRoot::named("lazy-initializer".into());
        let before = INITIAL_ENCODINGS.load(Ordering::Relaxed);
        let state = COUNTED_STATE.for_named_owner(&root, Counted(1));
        let again = COUNTED_STATE.for_named_owner(&root, Counted(99));
        assert_eq!(state.key(), again.key());
        assert_eq!(again.get_untracked().0, 1);
        assert_eq!(INITIAL_ENCODINGS.load(Ordering::Relaxed) - before, 1);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn untracked_reads_do_not_add_a_dependency() {
    run_without_cache_check(&REGISTRATION, async {
        let root = StateOwnerRoot::named("untracked-reader".into());
        let state = COUNTER.for_named_owner(&root, 1);
        let reader = untracked_reader(state.clone());
        let first = *reader.read_strongly_consistent().await?;
        let executions = UNTRACKED_RUNS.load(Ordering::Relaxed);
        assert_eq!(first, 1);
        state.set(2);
        assert_eq!(*reader.read_strongly_consistent().await?, 1);
        assert_eq!(UNTRACKED_RUNS.load(Ordering::Relaxed), executions);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn obsolete_state_dependencies_are_removed() {
    run_without_cache_check(&REGISTRATION, async {
        let enabled_root = StateOwnerRoot::named("switch-enabled".into());
        let counter_root = StateOwnerRoot::named("switch-counter".into());
        let enabled = ENABLE.for_named_owner(&enabled_root, true);
        let counter = COUNTER.for_named_owner(&counter_root, 1);
        let reader = conditional_reader(enabled.clone(), counter.clone());
        let start = CONDITIONAL_RUNS.load(Ordering::Relaxed);
        assert_eq!(*reader.read_strongly_consistent().await?, 1);
        enabled.set(false);
        assert_eq!(*reader.read_strongly_consistent().await?, 0);
        let after_switch = CONDITIONAL_RUNS.load(Ordering::Relaxed);
        assert_eq!(after_switch - start, 2);
        counter.set(2);
        assert_eq!(*reader.read_strongly_consistent().await?, 0);
        assert_eq!(CONDITIONAL_RUNS.load(Ordering::Relaxed), after_switch);
        enabled.set(true);
        assert_eq!(*reader.read_strongly_consistent().await?, 2);
        counter.set(3);
        assert_eq!(*reader.read_strongly_consistent().await?, 3);
        let after_update = CONDITIONAL_RUNS.load(Ordering::Relaxed);
        counter.set(3);
        assert_eq!(*reader.read_strongly_consistent().await?, 3);
        assert_eq!(CONDITIONAL_RUNS.load(Ordering::Relaxed), after_update);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn state_is_owned_by_backend_and_invalidates_tracked_readers() {
    run_without_cache_check(&REGISTRATION, async {
        let counter = create_counter();
        let counter_vc = counter.resolve().strongly_consistent().await?;
        let handle = counter.read_strongly_consistent().await?;
        let reader = read_counter(counter_vc);
        assert_eq!(*reader.read_strongly_consistent().await?, 1);
        handle.set(2);
        assert_eq!(*reader.read_strongly_consistent().await?, 2);
        assert_eq!(handle.get_untracked(), 2);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::value]
struct Selected {
    state: Option<TurboTasksState<u32>>,
}

#[turbo_tasks::function(operation)]
fn create_ephemeral_counter() -> Vc<Counter> {
    Counter(COUNTER.for_current_task(1)).cell()
}

#[turbo_tasks::function(operation, root)]
async fn select_ephemeral_counter(enabled: TurboTasksState<bool>) -> Result<Vc<Selected>> {
    let state = if enabled.get() {
        Some((*create_ephemeral_counter().connect().await?).clone())
    } else {
        None
    };
    Ok(Selected { state }.cell())
}

#[turbo_tasks::function(operation, root)]
fn read_named_counter(counter: TurboTasksState<u32>) -> Vc<Number> {
    Number(counter.get()).cell()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_reads_writes_and_snapshots_settle() {
    let (tt, dir) = create_tt_without_gc("concurrent_state_snapshot");
    let (root, state) = turbo_tasks::run(tt.clone(), async {
        let root = StateOwnerRoot::named("racing-counter".into());
        let state = COUNTER.for_named_owner(&root, 0);
        anyhow::Ok((root, state))
    })
    .await
    .unwrap();
    let barrier = Arc::new(tokio::sync::Barrier::new(3));
    let reader_tt = tt.clone();
    let reader_state = state.clone();
    let reader_barrier = barrier.clone();
    let reader = tokio::spawn(async move {
        turbo_tasks::run(reader_tt, async move {
            let operation = read_named_counter(reader_state);
            reader_barrier.wait().await;
            let mut previous = 0;
            for _ in 0..80 {
                let observed = *operation.read_strongly_consistent().await?;
                assert!(observed >= previous && observed <= 80);
                previous = observed;
                tokio::task::yield_now().await;
            }
            anyhow::Ok(())
        })
        .await
    });
    let writer_tt = tt.clone();
    let writer_state = state.clone();
    let writer_barrier = barrier.clone();
    let writer = tokio::spawn(async move {
        turbo_tasks::run(writer_tt, async move {
            writer_barrier.wait().await;
            for next in 1..=80 {
                writer_state.set(next);
                tokio::task::yield_now().await;
            }
            anyhow::Ok(())
        })
        .await
    });
    let snapshot_tt = tt.clone();
    let snapshotter = tokio::task::spawn_blocking(move || {
        tokio::runtime::Handle::current().block_on(barrier.wait());
        for _ in 0..12 {
            snapshot_tt
                .backend()
                .snapshot_and_evict_for_testing(&snapshot_tt);
        }
    });
    tokio::time::timeout(Duration::from_secs(30), async {
        reader.await.unwrap().unwrap();
        writer.await.unwrap().unwrap();
        snapshotter.await.unwrap();
    })
    .await
    .expect("state reader/writer/snapshot deadlocked");
    turbo_tasks::run(tt.clone(), async move {
        assert_eq!(state.get_untracked(), 80);
        assert_eq!(
            *read_named_counter(state).read_strongly_consistent().await?,
            80
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    drop(root);
    tt.stop_and_wait().await;
    let restarted = reopen_tt_with_gc(&dir);
    turbo_tasks::run(restarted.clone(), async {
        let root = StateOwnerRoot::named("racing-counter".into());
        let restored = COUNTER.for_named_owner(&root, 0);
        assert_eq!(restored.get_untracked(), 80);
        assert_eq!(
            *read_named_counter(restored)
                .read_strongly_consistent()
                .await?,
            80
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    restarted.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn named_root_can_be_dropped_after_shutdown() {
    let (tt, _dir) = create_tt_without_gc("named_root_after_shutdown");
    let root = turbo_tasks::run_once(tt.clone(), async {
        anyhow::Ok(StateOwnerRoot::named("late-drop".into()))
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    drop(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn top_level_named_owner_is_a_stable_state_namespace() {
    run_without_cache_check(&REGISTRATION, async {
        let root = StateOwnerRoot::named("independent-counter".into());
        let counter = COUNTER.for_named_owner(&root, 3);
        let second = SECOND_COUNTER.for_named_owner(&root, 7);
        let other_root = StateOwnerRoot::named("other-project".into());
        let other_owner = COUNTER.for_named_owner(&other_root, 17);
        assert_ne!(counter.key(), other_owner.key());
        assert_ne!(counter.key(), second.key());
        let reader = read_named_counter(counter.clone());
        assert_eq!(*reader.read_strongly_consistent().await?, 3);
        counter.set(4);
        assert_eq!(
            read_named_counter(counter.clone()).task_id(),
            reader.task_id()
        );
        assert_eq!(*reader.read_strongly_consistent().await?, 4);
        assert_eq!(second.get_untracked(), 7);
        assert_eq!(other_owner.get_untracked(), 17);
        drop(root);
        let root = StateOwnerRoot::named("independent-counter".into());
        assert_eq!(COUNTER.for_named_owner(&root, 100), counter);
        assert_eq!(counter.get_untracked(), 4);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn collecting_creator_removes_its_state_even_with_old_read_ref_held() {
    let (tt, _dir) = create_tt_with_gc_ttl("state_creator_collected", Duration::ZERO);
    let test_tt = tt.clone();
    let old_state = turbo_tasks::run_once(tt.clone(), async move {
        let root = StateOwnerRoot::named("keep-selector".into());
        let enabled = ENABLE.for_named_owner(&root, true);
        let selector = select_ephemeral_counter(enabled.clone());
        let previous = selector.read_strongly_consistent().await?;
        let state = previous.state.clone().expect("creator did not run");
        let dependent = read_named_counter(state.clone());
        assert_eq!(*dependent.read_strongly_consistent().await?, 1);
        enabled.set(false);
        assert!(selector.read_strongly_consistent().await?.state.is_none());
        // Retain the old value snapshot and its handle across collection.
        test_tt.backend().gc_for_testing(&test_tt);
        assert!(
            state.try_get_untracked().is_err(),
            "collected creator left an orphan state"
        );
        assert!(
            dependent.read_strongly_consistent().await.is_err(),
            "surviving dependent retained a clean result from deleted state"
        );
        anyhow::Ok(())
    })
    .await;
    old_state.unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn named_owner_is_rooted_then_ages_out_after_drop() {
    let (tt, _dir) = create_tt_with_gc_ttl("named_owner_ages_out", Duration::ZERO);
    let test_tt = tt.clone();
    let state = turbo_tasks::run(tt.clone(), async move {
        let root = StateOwnerRoot::named("short-lived".into());
        let state = COUNTER.for_named_owner(&root, 8);
        test_tt.backend().gc_for_testing(&test_tt);
        assert_eq!(state.get_untracked(), 8);
        drop(root);
        anyhow::Ok(state)
    })
    .await
    .unwrap();
    tt.backend().gc_for_testing(&tt);
    turbo_tasks::run(tt.clone(), {
        let state = state.clone();
        async move {
            assert_eq!(state.get_untracked(), 8);
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(5)).await;
    tt.backend().gc_for_testing(&tt);
    turbo_tasks::run(tt.clone(), async move {
        assert!(state.try_get_untracked().is_err());
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn creator_reexecution_does_not_reset_its_state() {
    run_without_cache_check(&REGISTRATION, async {
        let counter = reexecuting_creator();
        let old = counter.read_strongly_consistent().await?;
        old.set(9);
        let before = CREATOR_REEXECUTIONS.load(Ordering::Relaxed);
        let StateOwner::Task(owner) = old.key().owner else {
            panic!("expected task-scoped state");
        };
        turbo_tasks().invalidate(owner);
        let again = counter.read_strongly_consistent().await?;
        assert!(CREATOR_REEXECUTIONS.load(Ordering::Relaxed) > before);
        assert_eq!(old.key(), again.key());
        assert_eq!(again.get_untracked(), 9);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn old_read_ref_resolves_canonical_state_after_cell_eviction() {
    let (tt, _directory) = create_tt_without_gc("old_read_ref_resolves_canonical_state");
    turbo_tasks::run_once(tt.clone(), async move {
        let counter = create_counter();
        let old = counter.read_strongly_consistent().await?;
        assert_eq!(old.get_untracked(), 1);
        tt.backend().snapshot_and_evict_for_testing(&tt);
        let restored = counter.read_strongly_consistent().await?;
        restored.set(5);
        assert_eq!(old.get_untracked(), 5);
        assert_eq!(restored.get_untracked(), 5);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn persisted_state_dependencies_invalidate_after_restart() {
    let runs = Arc::new(AtomicUsize::new(0));
    run(&REGISTRATION, move || {
        let runs = runs.clone();
        async move {
            let expected = runs.fetch_add(1, Ordering::Relaxed) as u32 + 1;
            let root = StateOwnerRoot::named("persistent-counter".into());
            let state = COUNTER.for_named_owner(&root, 1);
            assert_eq!(state.get_untracked(), expected);
            let reader = read_named_counter(state.clone());
            assert_eq!(*reader.read_strongly_consistent().await?, expected);
            state.set(expected + 1);
            assert_eq!(*reader.read_strongly_consistent().await?, expected + 1);
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn rcstr_state_value_survives_restart() {
    let runs = Arc::new(AtomicUsize::new(0));
    run(&REGISTRATION, move || {
        let runs = runs.clone();
        async move {
            let root = StateOwnerRoot::named("text-state".into());
            let text = TEXT_STATE.for_named_owner(&root, "first".into());
            if runs.fetch_add(1, Ordering::Relaxed) == 0 {
                assert_eq!(text.get_untracked().as_str(), "first");
                text.set("second".into());
            }
            assert_eq!(text.get_untracked().as_str(), "second");
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn task_scoped_state_dependency_survives_restart() {
    let runs = Arc::new(AtomicUsize::new(0));
    run(&REGISTRATION, move || {
        let runs = runs.clone();
        async move {
            let expected = runs.fetch_add(1, Ordering::Relaxed) as u32 + 1;
            let counter = create_counter();
            let handle = counter.read_strongly_consistent().await?;
            let counter_vc = counter.resolve().strongly_consistent().await?;
            let reader = read_counter(counter_vc);
            assert_eq!(handle.get_untracked(), expected);
            assert_eq!(*reader.read_strongly_consistent().await?, expected);
            handle.set(expected + 1);
            assert_eq!(*reader.read_strongly_consistent().await?, expected + 1);
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn backend_state_survives_eviction_and_restart() {
    let runs = Arc::new(AtomicUsize::new(0));
    run(&REGISTRATION, move || {
        let runs = runs.clone();
        async move {
            let counter = create_counter();
            let handle = counter.read_strongly_consistent().await?;
            if runs.fetch_add(1, Ordering::Relaxed) == 0 {
                assert_eq!(handle.get_untracked(), 1);
                handle.set(2);
            }
            assert_eq!(handle.get_untracked(), 2);
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();
}
