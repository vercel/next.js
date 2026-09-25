#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod util;

use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::Result;
use tokio::sync::Notify;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, NonLocalValue, ReadRef, ResolvedVc, State, TransientInstance,
    ValueToString, Vc, VcValueTrait, backend::Backend, emit, trace::TraceRawVcs,
};
use turbo_tasks_testing::{Registration, register, run_once};

use crate::util::create_tt;

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::value]
struct TestCollectible;

#[turbo_tasks::value_impl]
impl ValueToString for TestCollectible {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("collectible".into())
    }
}

#[derive(TraceRawVcs, NonLocalValue)]
struct ExecutionControl {
    #[turbo_tasks(trace_ignore)]
    block_from_generation: usize,
    #[turbo_tasks(trace_ignore)]
    started: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    emitted: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    progress_notify: Notify,
    #[turbo_tasks(trace_ignore)]
    dropped: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    dropped_notify: Notify,
    #[turbo_tasks(trace_ignore)]
    release: Notify,
}

impl ExecutionControl {
    fn new(block_from_generation: usize) -> Self {
        Self {
            block_from_generation,
            started: AtomicUsize::new(0),
            emitted: AtomicUsize::new(0),
            progress_notify: Notify::new(),
            dropped: AtomicUsize::new(0),
            dropped_notify: Notify::new(),
            release: Notify::new(),
        }
    }

    async fn wait_for_started(&self, count: usize) {
        while self.started.load(Ordering::Acquire) < count {
            self.progress_notify.notified().await;
        }
    }

    async fn wait_for_emitted(&self, count: usize) {
        while self.emitted.load(Ordering::Acquire) < count {
            self.progress_notify.notified().await;
        }
    }

    async fn wait_for_dropped(&self, count: usize) {
        while self.dropped.load(Ordering::Acquire) < count {
            self.dropped_notify.notified().await;
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

async fn run_collectible_producer(
    input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<()>> {
    let should_emit = *input.await?.state.get() != 0;
    let generation = control.started.fetch_add(1, Ordering::AcqRel);
    control.progress_notify.notify_waiters();
    let _drop_guard = ExecutionDropGuard {
        control: control.clone(),
    };

    if should_emit {
        let collectible: ResolvedVc<Box<dyn ValueToString>> =
            ResolvedVc::upcast(TestCollectible.resolved_cell());
        emit(collectible);
        control.emitted.fetch_add(1, Ordering::Release);
        control.progress_notify.notify_waiters();
    }

    if generation >= control.block_from_generation {
        control.release.notified().await;
    }

    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn collectible_producer(
    input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<()>> {
    run_collectible_producer(input, control).await
}

#[turbo_tasks::function]
async fn non_root_collectible_producer(
    input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<()>> {
    run_collectible_producer(input, control).await
}

#[turbo_tasks::function(operation, root)]
async fn conditional_parent(
    selector: ResolvedVc<ChangingInput>,
    producer_input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<u32>> {
    let selected = *selector.await?.state.get();
    if selected == 0 {
        let producer = collectible_producer(producer_input, control);
        producer.connect().await?;
        return Ok(Vc::cell(
            producer.peek_collectibles::<Box<dyn ValueToString>>().len() as u32,
        ));
    }
    Ok(Vc::cell(0))
}

#[turbo_tasks::function(operation, root)]
async fn conditional_non_root_parent(
    selector: ResolvedVc<ChangingInput>,
    producer_input: ResolvedVc<ChangingInput>,
    control: TransientInstance<ExecutionControl>,
) -> Result<Vc<()>> {
    if *selector.await?.state.get() == 0 {
        non_root_collectible_producer(*producer_input, control).await?;
    }
    Ok(Vc::cell(()))
}

/// A collectible published only by an execution that is later aborted must not be reported by a
/// strongly-consistent replacement root.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn aborted_first_execution_does_not_report_collectible() {
    run_once(&REGISTRATION, async || {
        let selector = ReadRef::new_owned(ChangingInput {
            state: State::new(0),
        });
        let selector_vc = ReadRef::resolved_cell(selector.clone());
        let producer_input = ReadRef::new_owned(ChangingInput {
            state: State::new(1),
        });
        let producer_input_vc = ReadRef::resolved_cell(producer_input.clone());
        let control = TransientInstance::new(ExecutionControl::new(0));
        let parent = conditional_parent(selector_vc, producer_input_vc, control.clone());

        let read_parent = parent.read_strongly_consistent();
        let disconnect = async {
            control.wait_for_emitted(1).await;
            selector.state.set(1);
            control.wait_for_dropped(1).await;
            // If reading collectibles revives the producer, its replacement emits nothing and
            // therefore cannot hide the aborted generation's leaked collectible.
            producer_input.state.set(0);
            anyhow::Ok(())
        };
        tokio::try_join!(read_parent, disconnect)?;

        let collectibles = collectible_producer(producer_input_vc, control.clone())
            .peek_collectibles::<Box<dyn ValueToString>>();
        assert!(
            collectibles.is_empty(),
            "an aborted generation reported {} collectible(s)",
            collectibles.len()
        );

        // Keep cleanup safe if a failure above leaves the execution parked.
        control.release.notify_one();
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

/// Rollback of an aborted non-root emitter must bypass the user-facing rule that only root tasks
/// may explicitly remove collectibles.
///
/// The emptiness assertion below is weak on its own — a disconnected child stops propagating
/// collectibles to its parent either way. The load-bearing part of this test is that the rollback
/// runs at all: routing it through the user-level entry point instead panics with "Removing
/// collectibles from non-root task".
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn aborted_non_root_execution_does_not_report_collectible() {
    run_once(&REGISTRATION, async || {
        let selector = ReadRef::new_owned(ChangingInput {
            state: State::new(0),
        });
        let selector_vc = ReadRef::resolved_cell(selector.clone());
        let producer_input = ReadRef::new_owned(ChangingInput {
            state: State::new(1),
        });
        let producer_input_vc = ReadRef::resolved_cell(producer_input.clone());
        let control = TransientInstance::new(ExecutionControl::new(0));
        let parent = conditional_non_root_parent(selector_vc, producer_input_vc, control.clone());

        let read_parent = parent.read_strongly_consistent();
        let disconnect = async {
            control.wait_for_emitted(1).await;
            selector.state.set(1);
            control.wait_for_dropped(1).await;
            producer_input.state.set(0);
            anyhow::Ok(())
        };
        tokio::try_join!(read_parent, disconnect)?;

        assert!(
            parent
                .peek_collectibles::<Box<dyn ValueToString>>()
                .is_empty(),
            "a non-root aborted generation reported a collectible"
        );

        control.release.notify_one();
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

/// Aborting a recomputation must preserve the collectible published by the last completed
/// generation, including when the aborted generation re-emitted that same collectible.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn aborted_recomputation_preserves_completed_collectible() {
    let (tt, _persistence_dir) = create_tt("aborted_recomputation_preserves_completed_collectible");
    let control = TransientInstance::new(ExecutionControl::new(1));

    // Complete generation 0 and publish its collectible.
    let (producer_input, producer_input_vc) = turbo_tasks::run_once(tt.clone(), {
        let control = control.clone();
        async move {
            let producer_input = ReadRef::new_owned(ChangingInput {
                state: State::new(1),
            });
            let producer_input_vc = ReadRef::resolved_cell(producer_input.clone());
            let producer = collectible_producer(producer_input_vc, control);
            producer.read_strongly_consistent().await?;
            assert_eq!(
                producer.peek_collectibles::<Box<dyn ValueToString>>().len(),
                1,
                "the completed generation should publish one collectible"
            );
            anyhow::Ok((producer_input, producer_input_vc))
        }
    })
    .await
    .unwrap();

    // Generation 1 re-emits the same collectible and parks. Invalidation aborts it and starts a
    // non-emitting generation 2, which parks before completion. Once generation 2 has started, the
    // abort callback (including rollback) is known to have finished. Inspect the backend directly
    // so the assertion cannot itself reconnect or complete the producer.
    turbo_tasks::run_once(tt.clone(), {
        let tt = tt.clone();
        let control = control.clone();
        let producer_input = producer_input.clone();
        async move {
            producer_input.state.set(2);
            let producer = collectible_producer(producer_input_vc, control.clone());
            let read_producer = producer.read_strongly_consistent();
            let abort_and_inspect = async {
                control.wait_for_emitted(2).await;
                producer_input.state.set(0);
                control.wait_for_dropped(2).await;
                control.wait_for_started(3).await;

                let collectibles = tt.backend().read_task_collectibles(
                    producer.task_id(),
                    <Box<dyn ValueToString> as VcValueTrait>::get_trait_type_id(),
                    None,
                    &tt,
                );
                assert_eq!(
                    collectibles.values().sum::<i32>(),
                    1,
                    "aborting a recomputation removed the last completed collectible"
                );
                control.release.notify_one();
                anyhow::Ok(())
            };
            tokio::try_join!(read_producer, abort_and_inspect)?;
            anyhow::Ok(())
        }
    })
    .await
    .unwrap();

    tt.stop_and_wait().await;
}
