#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod util;

use std::{
    sync::{
        Barrier,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use tokio::sync::Notify;
use turbo_tasks::{
    ReadRef, ResolvedVc, State, TransientInstance, TurboTasksApi, Vc, trace::TraceRawVcs,
};

use crate::util::create_tt;

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[derive(TraceRawVcs)]
struct ExecutionControl {
    #[turbo_tasks(trace_ignore)]
    started: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    started_notify: Notify,
    #[turbo_tasks(trace_ignore)]
    dropped: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    dropped_notify: Notify,
    #[turbo_tasks(trace_ignore)]
    releases: [Notify; 2],
}

impl ExecutionControl {
    fn new() -> Self {
        Self {
            started: AtomicUsize::new(0),
            started_notify: Notify::new(),
            dropped: AtomicUsize::new(0),
            dropped_notify: Notify::new(),
            releases: [Notify::new(), Notify::new()],
        }
    }

    async fn wait_for_started(&self, count: usize) {
        while self.started.load(Ordering::Acquire) < count {
            self.started_notify.notified().await;
        }
    }

    async fn wait_for_dropped(&self, count: usize) {
        while self.dropped.load(Ordering::Acquire) < count {
            self.dropped_notify.notified().await;
        }
    }
}

#[derive(TraceRawVcs)]
struct CompletionRaceControl {
    #[turbo_tasks(trace_ignore)]
    started: Notify,
    #[turbo_tasks(trace_ignore)]
    generation: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    first_poll_release: Barrier,
}

impl CompletionRaceControl {
    fn new() -> Self {
        Self {
            started: Notify::new(),
            generation: AtomicUsize::new(0),
            first_poll_release: Barrier::new(2),
        }
    }
}

struct ExecutionDropGuard {
    control: TransientInstance<ExecutionControl>,
}

impl Drop for ExecutionDropGuard {
    fn drop(&mut self) {
        self.control.dropped.fetch_add(1, Ordering::Release);
        self.control.dropped_notify.notify_waiters();
    }
}

#[turbo_tasks::function(root)]
async fn blocking_task(
    input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<u32>> {
    let value = *input.await?.state.get();
    let generation = control.started.fetch_add(1, Ordering::AcqRel);
    control.started_notify.notify_waiters();
    let _drop_guard = ExecutionDropGuard {
        control: control.clone(),
    };
    control.releases[generation].notified().await;
    Ok(Vc::cell(value))
}

#[turbo_tasks::function(root)]
async fn completion_race_task(
    input: ResolvedVc<ChangingInput>,
    control: TransientInstance<CompletionRaceControl>,
) -> Result<Vc<u32>> {
    let value = *input.await?.state.get();
    let generation = control.generation.fetch_add(1, Ordering::AcqRel);
    if generation == 0 {
        control.started.notify_waiters();
        // Keep the current poll in progress while another runtime thread requests abortion. The
        // future then returns Ready without giving Abortable another chance to observe the request.
        control.first_poll_release.wait();
    }
    Ok(Vc::cell(value))
}

#[turbo_tasks::function(root, non_cancelable)]
async fn non_cancelable_blocking_task(
    input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<u32>> {
    let value = *input.await?.state.get();
    let generation = control.started.fetch_add(1, Ordering::AcqRel);
    control.started_notify.notify_waiters();
    let _drop_guard = ExecutionDropGuard {
        control: control.clone(),
    };
    control.releases[generation].notified().await;
    Ok(Vc::cell(value))
}

#[turbo_tasks::function]
async fn blocking_middle(
    child_input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<u32>> {
    Ok(Vc::cell(*blocking_task(*child_input, control).await?))
}

#[turbo_tasks::function(root)]
async fn awaits_blocking_subtree(
    selector: ResolvedVc<ChangingInput>,
    child_input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<u32>> {
    let selected = *selector.await?.state.get();
    let child = *blocking_middle(*child_input, control).await?;
    Ok(Vc::cell(selected + child))
}

/// Invalidating an executing task should drop the stale future rather than waiting for it to
/// finish, then run the task once with the new input.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidation_aborts_in_flight_execution() {
    let (tt, _persistence_dir) = create_tt("invalidation_aborts_in_flight_execution");
    tt.task_statistics().enable();
    let control = TransientInstance::new(ExecutionControl::new());
    let control_for_run = control.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let input = ReadRef::resolved_cell(ReadRef::new_owned(ChangingInput {
            state: State::new(0),
        }));
        let output = blocking_task(*input, control_for_run.clone());

        let read_output = output.strongly_consistent();
        let drive_invalidation = async {
            control_for_run.wait_for_started(1).await;
            input.await?.state.set(1);

            let aborted = tokio::time::timeout(
                Duration::from_millis(250),
                control_for_run.wait_for_dropped(1),
            )
            .await
            .is_ok();

            // Permits make cleanup deterministic on both the pre-fix and fixed paths.
            control_for_run.releases[0].notify_one();
            control_for_run.releases[1].notify_one();
            anyhow::Ok(aborted)
        };

        let (value, aborted) = tokio::try_join!(read_output, drive_invalidation)?;
        assert!(aborted, "the stale execution was not aborted");
        assert_eq!(*value, 1);
        assert_eq!(control_for_run.started.load(Ordering::Acquire), 2);
        anyhow::Ok(())
    })
    .await;

    result.unwrap();
    let stats = tt
        .task_statistics()
        .get()
        .unwrap()
        .get(&BLOCKING_TASK_FUNCTION);
    assert_eq!(stats.execution_started, 2);
    assert_eq!(stats.execution_completed, 1);
    assert_eq!(stats.abort_requested_invalidation, 1);
    assert_eq!(stats.abort_observed_invalidation, 1);
    assert_eq!(stats.abort_raced_completion_invalidation, 0);
    tt.stop_and_wait().await;
}

/// A cancellation-unsafe task opts out: invalidation marks it stale but lets the current future
/// finish before the fresh execution starts.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn non_cancelable_execution_runs_to_completion() {
    let (tt, _persistence_dir) = create_tt("non_cancelable_execution_runs_to_completion");
    tt.task_statistics().enable();
    let control = TransientInstance::new(ExecutionControl::new());
    let control_for_run = control.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let input = ReadRef::resolved_cell(ReadRef::new_owned(ChangingInput {
            state: State::new(0),
        }));
        let output = non_cancelable_blocking_task(*input, control_for_run.clone());

        let read_output = output.strongly_consistent();
        let drive_invalidation = async {
            control_for_run.wait_for_started(1).await;
            input.await?.state.set(1);

            assert!(
                tokio::time::timeout(
                    Duration::from_millis(250),
                    control_for_run.wait_for_dropped(1),
                )
                .await
                .is_err(),
                "non-cancelable execution was aborted"
            );

            control_for_run.releases[0].notify_one();
            control_for_run.wait_for_started(2).await;
            control_for_run.releases[1].notify_one();
            anyhow::Ok(())
        };

        let (value, ()) = tokio::try_join!(read_output, drive_invalidation)?;
        assert_eq!(*value, 1);
        assert_eq!(control_for_run.started.load(Ordering::Acquire), 2);
        anyhow::Ok(())
    })
    .await;

    control.releases[0].notify_one();
    control.releases[1].notify_one();
    result.unwrap();
    let stats = tt
        .task_statistics()
        .get()
        .unwrap()
        .get(&NON_CANCELABLE_BLOCKING_TASK_FUNCTION);
    assert_eq!(stats.execution_started, 2);
    assert_eq!(stats.execution_completed, 2);
    assert_eq!(stats.abort_requested_invalidation, 1);
    assert_eq!(stats.abort_skipped_invalidation, 1);
    assert_eq!(stats.abort_observed_invalidation, 0);
    tt.stop_and_wait().await;
}

/// Aborting a parent must recursively undo speculative active-count increments so a blocked
/// grandchild becomes inactive and is aborted too. Re-running the subtree starts it from scratch.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn inactive_subtree_is_aborted_and_restarts_when_reconnected() {
    let (tt, _persistence_dir) =
        create_tt("inactive_subtree_is_aborted_and_restarts_when_reconnected");
    tt.task_statistics().enable();
    let control = TransientInstance::new(ExecutionControl::new());
    let control_for_run = control.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let selector = ReadRef::resolved_cell(ReadRef::new_owned(ChangingInput {
            state: State::new(0),
        }));
        let child_input = ReadRef::resolved_cell(ReadRef::new_owned(ChangingInput {
            state: State::new(10),
        }));
        let output = awaits_blocking_subtree(*selector, *child_input, control_for_run.clone());

        let read_output = output.strongly_consistent();
        let drive_disconnection = async {
            control_for_run.wait_for_started(1).await;
            selector.await?.state.set(1);

            tokio::time::timeout(Duration::from_secs(5), control_for_run.wait_for_dropped(1))
                .await
                .expect("the inactive child execution was not aborted");
            control_for_run.wait_for_started(2).await;
            control_for_run.releases[1].notify_one();
            anyhow::Ok(())
        };

        let (value, ()) = tokio::try_join!(read_output, drive_disconnection)?;
        assert_eq!(*value, 11);
        assert_eq!(control_for_run.started.load(Ordering::Acquire), 2);
        anyhow::Ok(())
    })
    .await;

    // Keep cleanup safe if an assertion above exits before the blocked execution is aborted.
    control.releases[0].notify_one();
    control.releases[1].notify_one();
    result.unwrap();
    let stats = tt
        .task_statistics()
        .get()
        .unwrap()
        .get(&BLOCKING_TASK_FUNCTION);
    assert_eq!(stats.execution_started, 2);
    assert_eq!(stats.execution_completed, 1);
    assert_eq!(stats.abort_requested_inactive, 1);
    assert_eq!(stats.abort_observed_inactive, 1);
    tt.stop_and_wait().await;
}

/// A task that returns Ready from the poll during which abortion was requested completes normally,
/// records the lost race, and uses ordinary stale re-execution.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn successful_completion_records_abort_race() {
    let (tt, _persistence_dir) = create_tt("successful_completion_records_abort_race");
    tt.task_statistics().enable();
    let control = TransientInstance::new(CompletionRaceControl::new());
    let control_for_run = control.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let input = ReadRef::resolved_cell(ReadRef::new_owned(ChangingInput {
            state: State::new(0),
        }));
        let output = completion_race_task(*input, control_for_run.clone());
        let read_output = output.strongly_consistent();
        let drive_race = async {
            while control_for_run.generation.load(Ordering::Acquire) < 1 {
                control_for_run.started.notified().await;
            }
            input.await?.state.set(1);
            control_for_run.first_poll_release.wait();
            anyhow::Ok(())
        };

        let (value, ()) = tokio::try_join!(read_output, drive_race)?;
        assert_eq!(*value, 1);
        anyhow::Ok(())
    })
    .await;

    result.unwrap();
    let stats = tt
        .task_statistics()
        .get()
        .unwrap()
        .get(&COMPLETION_RACE_TASK_FUNCTION);
    assert_eq!(stats.execution_started, 2);
    assert_eq!(stats.execution_completed, 2);
    assert_eq!(stats.abort_requested_invalidation, 1);
    assert_eq!(stats.abort_raced_completion_invalidation, 1);
    assert_eq!(stats.abort_observed_invalidation, 0);
    tt.stop_and_wait().await;
}

/// Completing at the same time as invalidation must either complete the stale poll or abort it,
/// but in both cases exactly one fresh execution must publish the new value.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn completion_racing_invalidation_has_one_fresh_execution() {
    let (tt, _persistence_dir) =
        create_tt("completion_racing_invalidation_has_one_fresh_execution");
    tt.task_statistics().enable();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        for _ in 0..16 {
            let control = TransientInstance::new(ExecutionControl::new());
            let input = ReadRef::resolved_cell(ReadRef::new_owned(ChangingInput {
                state: State::new(0),
            }));
            let output = blocking_task(*input, control.clone());

            let read_output = output.strongly_consistent();
            let drive_race = async {
                control.wait_for_started(1).await;
                let invalidate = async {
                    input.await?.state.set(1);
                    anyhow::Ok(())
                };
                let complete = async {
                    control.releases[0].notify_one();
                    anyhow::Ok(())
                };
                tokio::try_join!(invalidate, complete)?;
                control.wait_for_started(2).await;
                control.releases[1].notify_one();
                anyhow::Ok(())
            };

            let (value, ()) = tokio::try_join!(read_output, drive_race)?;
            assert_eq!(*value, 1);
            assert_eq!(control.started.load(Ordering::Acquire), 2);
        }
        anyhow::Ok(())
    })
    .await;

    result.unwrap();
    let stats = tt
        .task_statistics()
        .get()
        .unwrap()
        .get(&BLOCKING_TASK_FUNCTION);
    assert_eq!(stats.abort_requested_invalidation, 16);
    assert_eq!(
        stats.abort_observed_invalidation + stats.abort_raced_completion_invalidation,
        16
    );
    assert_eq!(stats.execution_started, 32);
    assert_eq!(
        stats.execution_completed + stats.abort_observed_invalidation,
        32
    );
    tt.stop_and_wait().await;
}
