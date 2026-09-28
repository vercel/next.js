#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A strongly consistent collector must not be re-executed because of collectibles that change
//! while it is still waiting for its source to settle.
//!
//! Until the collector reads the collectibles again, its dependency on them is left over from the
//! previous execution. Collectibles emitted in the meantime will be seen when the read happens, so
//! they must make the collector dirty without making the running execution stale.

use std::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};

use anyhow::Result;
use futures::future::try_join_all;
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
    // Slow enough that the collector re-executes while collectibles are still being emitted.
    tokio::time::sleep(Duration::from_millis(5)).await;
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
