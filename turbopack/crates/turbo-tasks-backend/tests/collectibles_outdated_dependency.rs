#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A strongly consistent collector must not be re-executed because of collectibles that change
//! while it is still waiting for its source to settle.
//!
//! Until the collector reads the collectibles again, its dependency on them is left over from the
//! previous execution. Collectibles emitted in the meantime will be seen when the read happens, so
//! they must make the collector dirty without making the running execution stale.
//!
//! There are two variants:
//! - [`collector_is_not_re_executed_for_collectibles_it_has_not_read_yet`] lets the input change
//!   race freely. It re-executes the collector right after its previous execution completed, which
//!   also covers that the completion's cleanup can't remove the left-over dependencies of the next
//!   execution. Its overlap depends on timing: a `State` invalidates its readers one by one, so the
//!   collector could in principle read the source before the source was invalidated, see the old
//!   collectibles, and then legitimately re-execute when the new ones arrive.
//! - [`gated_collector_is_not_re_executed_for_collectibles_it_has_not_read_yet`] stages the overlap
//!   explicitly with [`Gates`], so it doesn't depend on that order.

use std::{
    future::{Future, poll_fn},
    pin::pin,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    task::Poll,
};

use anyhow::Result;
use futures::future::try_join_all;
use tokio::sync::watch;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, NonLocalValue, ReadRef, ResolvedVc, State, TransientInstance,
    ValueToString, Vc, emit,
};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct Input {
    count: State<u32>,
}

#[turbo_tasks::value]
struct Thing(u32);

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(format!("thing {}", self.0).into())
    }
}

#[derive(NonLocalValue, Default)]
struct ExecutionCounter {
    executions: AtomicUsize,
}

#[turbo_tasks::function]
async fn emit_one(i: u32) -> Result<Vc<()>> {
    emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(
        Thing(i).resolved_cell(),
    ));
    Ok(Vc::cell(()))
}

/// Emits `count` distinct collectibles, so changing `count` changes the collectible set.
#[turbo_tasks::function]
async fn emit_all(input: ResolvedVc<Input>) -> Result<Vc<()>> {
    let count = *input.await?.count.get();
    try_join_all((0..count).map(|i| emit_one(i).into_future())).await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn source(input: ResolvedVc<Input>) -> Result<Vc<()>> {
    emit_all(*input).await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn collector(
    input: ResolvedVc<Input>,
    take: bool,
    counter: TransientInstance<ExecutionCounter>,
) -> Result<Vc<u32>> {
    counter.executions.fetch_add(1, Ordering::AcqRel);
    // Depend on the input directly, so that a change re-executes the collector right away, while
    // the source is still emitting.
    let _ = *input.await?.count.get();
    let source = source(input);
    source.read_strongly_consistent().await?;
    let collectibles = if take {
        source.take_collectibles::<Box<dyn ValueToString>>()
    } else {
        source.peek_collectibles::<Box<dyn ValueToString>>()
    };
    Ok(Vc::cell(collectibles.len() as u32))
}

async fn executions_after_change(take: bool) -> Result<usize> {
    let input = ReadRef::new_owned(Input {
        count: State::new(5),
    });
    let input_vc = ReadRef::resolved_cell(input.clone());
    let counter = TransientInstance::new(ExecutionCounter::default());
    let collector = collector(input_vc, take, counter.clone());

    assert_eq!(*collector.read_strongly_consistent().await?, 5);
    let initial = counter.executions.load(Ordering::Acquire);
    assert_eq!(initial, 1, "take={take}: initial executions");

    input.count.set(200);
    assert_eq!(*collector.read_strongly_consistent().await?, 200);
    Ok(counter.executions.load(Ordering::Acquire) - initial)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn collector_is_not_re_executed_for_collectibles_it_has_not_read_yet() {
    run_once(&REGISTRATION, async || {
        for take in [false, true] {
            assert_eq!(
                executions_after_change(take).await?,
                1,
                "take={take}: executions after the input change"
            );
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Shared between the collector and the emitter of one gated test case.
#[derive(NonLocalValue)]
struct Gates {
    executions: AtomicUsize,
    /// Set once the input has changed; only then do the gates below apply.
    armed: AtomicBool,
    /// The emitter's execution after the input change has started.
    #[turbo_tasks(unsafe_ignore)] // holds no `Vc`
    emitter_started: watch::Sender<bool>,
    /// The collector's source read is waiting for the source.
    #[turbo_tasks(unsafe_ignore)] // holds no `Vc`
    collector_waiting: watch::Sender<bool>,
}

impl Default for Gates {
    fn default() -> Self {
        Self {
            executions: AtomicUsize::new(0),
            armed: AtomicBool::new(false),
            emitter_started: watch::Sender::new(false),
            collector_waiting: watch::Sender::new(false),
        }
    }
}

async fn wait_for(gate: &watch::Sender<bool>) {
    gate.subscribe()
        .wait_for(|open| *open)
        .await
        .expect("the sender is alive while it is borrowed");
}

/// Like [`emit_all`], but after the input change it only emits once the collector is waiting for
/// the source.
#[turbo_tasks::function]
async fn gated_emit_all(
    input: ResolvedVc<Input>,
    gates: TransientInstance<Gates>,
) -> Result<Vc<()>> {
    let count = *input.await?.count.get();
    if gates.armed.load(Ordering::Acquire) {
        gates.emitter_started.send_replace(true);
        wait_for(&gates.collector_waiting).await;
    }
    try_join_all((0..count).map(|i| emit_one(i).into_future())).await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn gated_source(input: ResolvedVc<Input>, gates: TransientInstance<Gates>) -> Result<Vc<()>> {
    gated_emit_all(*input, gates).await?;
    Ok(Vc::cell(()))
}

/// Like [`collector`], but after the input change it only reads the source once the source was
/// invalidated by it (the emitter's new execution has started).
#[turbo_tasks::function(operation, root)]
async fn gated_collector(
    input: ResolvedVc<Input>,
    take: bool,
    gates: TransientInstance<Gates>,
) -> Result<Vc<u32>> {
    gates.executions.fetch_add(1, Ordering::AcqRel);
    let _ = *input.await?.count.get();
    let armed = gates.armed.load(Ordering::Acquire);
    if armed {
        wait_for(&gates.emitter_started).await;
    }
    let source = gated_source(input, gates.clone());
    if armed {
        let mut read = pin!(source.read_strongly_consistent());
        poll_fn(|cx| match read.as_mut().poll(cx) {
            Poll::Ready(_) => panic!("the source can't settle before it is allowed to emit"),
            Poll::Pending => {
                // The source emits while the read is waiting for it.
                gates.collector_waiting.send_replace(true);
                Poll::Ready(())
            }
        })
        .await;
        read.await?;
    } else {
        source.read_strongly_consistent().await?;
    }
    let collectibles = if take {
        source.take_collectibles::<Box<dyn ValueToString>>()
    } else {
        source.peek_collectibles::<Box<dyn ValueToString>>()
    };
    Ok(Vc::cell(collectibles.len() as u32))
}

async fn gated_executions_after_change(take: bool) -> Result<usize> {
    let input = ReadRef::new_owned(Input {
        count: State::new(5),
    });
    let input_vc = ReadRef::resolved_cell(input.clone());
    let gates = TransientInstance::new(Gates::default());
    let collector = gated_collector(input_vc, take, gates.clone());

    assert_eq!(*collector.read_strongly_consistent().await?, 5);
    let initial = gates.executions.load(Ordering::Acquire);
    assert_eq!(initial, 1, "take={take}: initial executions");

    gates.armed.store(true, Ordering::Release);
    input.count.set(200);
    assert_eq!(*collector.read_strongly_consistent().await?, 200);
    Ok(gates.executions.load(Ordering::Acquire) - initial)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gated_collector_is_not_re_executed_for_collectibles_it_has_not_read_yet() {
    run_once(&REGISTRATION, async || {
        for take in [false, true] {
            assert_eq!(
                gated_executions_after_change(take).await?,
                1,
                "take={take}: executions after the input change"
            );
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
