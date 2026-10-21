#![feature(arbitrary_self_types)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

mod util;

use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_tasks::{
    InvalidationReason, InvalidationReasonKind, Invalidator, ResolvedVc, State, TryJoinIterExt,
    TurboTasks, Vc, util::StaticOrArc,
};
use turbo_tasks_backend::TurboTasksBackend;

use crate::util::create_tt;

/// The invalidators and execution counts of the `dependent` tasks of one test, keyed by
/// `(test, index)`.
static INVALIDATORS: Mutex<Option<FxHashMap<(u32, u32), Invalidator>>> = Mutex::new(None);
static EXECUTIONS: Mutex<Option<FxHashMap<(u32, u32), u32>>> = Mutex::new(None);

#[turbo_tasks::function]
fn dependent(test: u32, index: u32) -> Vc<u32> {
    let invalidator = turbo_tasks::get_invalidator().unwrap();
    INVALIDATORS
        .lock()
        .unwrap()
        .get_or_insert_default()
        .insert((test, index), invalidator);
    let mut executions = EXECUTIONS.lock().unwrap();
    let count = executions
        .get_or_insert_default()
        .entry((test, index))
        .or_default();
    *count += 1;
    Vc::cell(*count)
}

/// Sums the execution counts of `width` dependents.
#[turbo_tasks::function(operation, root)]
async fn root(test: u32, width: u32) -> Result<Vc<u32>> {
    let counts = (0..width)
        .map(|index| dependent(test, index))
        .try_join()
        .await?;
    Ok(Vc::cell(counts.iter().map(|count| **count).sum()))
}

fn invalidators(test: u32, indices: impl IntoIterator<Item = u32>) -> Vec<Invalidator> {
    let invalidators = INVALIDATORS.lock().unwrap();
    let invalidators = invalidators.as_ref().unwrap();
    indices
        .into_iter()
        .map(|index| invalidators[&(test, index)])
        .collect()
}

fn executions(test: u32, index: u32) -> u32 {
    EXECUTIONS.lock().unwrap().as_ref().unwrap()[&(test, index)]
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct TestReason(&'static str);

impl InvalidationReason for TestReason {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        None
    }
}

impl std::fmt::Display for TestReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "test reason {}", self.0)
    }
}

/// A set large enough to be split into parallel chunks re-executes every task once.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn invalidate_all_large_set_reexecutes_all() {
    const TEST: u32 = 0;
    const WIDTH: u32 = 2_000;
    let (tt, _persistence_dir) = create_tt("invalidate_all_large_set_reexecutes_all");
    let tt2 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(*root(TEST, WIDTH).read_strongly_consistent().await?, WIDTH);

        Invalidator::invalidate_all(invalidators(TEST, 0..WIDTH), &*tt2);

        assert_eq!(
            *root(TEST, WIDTH).read_strongly_consistent().await?,
            2 * WIDTH
        );
        for index in 0..WIDTH {
            assert_eq!(executions(TEST, index), 2, "dependent {index}");
        }
        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// Reads the root inside a `run_once`. The update info is only recorded once all foreground jobs
/// (including the `run_once` itself) are done, so it must be awaited outside of it.
async fn read_root(tt: &Arc<TurboTasks<TurboTasksBackend>>, test: u32, width: u32) -> u32 {
    turbo_tasks::run_once(tt.clone(), async move {
        Ok(*root(test, width).read_strongly_consistent().await?)
    })
    .await
    .unwrap()
}

/// The reasons of a batch end up in the aggregated update info.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidate_all_with_reasons_records_reasons() {
    const TEST: u32 = 1;
    const WIDTH: u32 = 4;
    let (tt, _persistence_dir) = create_tt("invalidate_all_with_reasons_records_reasons");
    assert_eq!(read_root(&tt, TEST, WIDTH).await, WIDTH);
    // Consume the update info of the initial execution.
    tt.get_or_wait_aggregated_update_info(Duration::ZERO).await;

    Invalidator::invalidate_all_with_reason(invalidators(TEST, 0..2), &*tt, TestReason("one"));
    Invalidator::invalidate_all_with_reasons(
        invalidators(TEST, 2..WIDTH),
        &*tt,
        [TestReason("two"), TestReason("three")],
    );
    assert_eq!(read_root(&tt, TEST, WIDTH).await, 2 * WIDTH);

    let reasons = tt
        .get_or_wait_aggregated_update_info(Duration::ZERO)
        .await
        .reasons
        .to_string();
    for reason in ["one", "two", "three"] {
        assert!(
            reasons.contains(&format!("test reason {reason}")),
            "missing reason {reason:?} in {reasons:?}"
        );
    }
    tt.stop_and_wait().await;
}

/// Empty batches invalidate nothing and record no reasons.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidate_all_empty_is_noop() {
    const TEST: u32 = 2;
    const WIDTH: u32 = 2;
    let (tt, _persistence_dir) = create_tt("invalidate_all_empty_is_noop");
    assert_eq!(read_root(&tt, TEST, WIDTH).await, WIDTH);
    tt.get_or_wait_aggregated_update_info(Duration::ZERO).await;

    Invalidator::invalidate_all([], &*tt);
    Invalidator::invalidate_all_with_reason([], &*tt, TestReason("ignored"));
    Invalidator::invalidate_all_with_reasons([], &*tt, [TestReason("ignored")]);
    // A real invalidation, so that there is an update to report.
    Invalidator::invalidate_all(invalidators(TEST, [0]), &*tt);
    assert_eq!(read_root(&tt, TEST, WIDTH).await, WIDTH + 1);

    let reasons = tt
        .get_or_wait_aggregated_update_info(Duration::ZERO)
        .await
        .reasons
        .to_string();
    assert!(
        !reasons.contains("ignored"),
        "unexpected reasons {reasons:?}"
    );
    assert_eq!(executions(TEST, 0), 2);
    assert_eq!(executions(TEST, 1), 1);
    tt.stop_and_wait().await;
}

/// The same invalidator passed several times in one batch invalidates its task once.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidate_all_deduplicates() {
    const TEST: u32 = 3;
    const WIDTH: u32 = 3;
    let (tt, _persistence_dir) = create_tt("invalidate_all_deduplicates");
    let tt2 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(*root(TEST, WIDTH).read_strongly_consistent().await?, WIDTH);

        Invalidator::invalidate_all(invalidators(TEST, [0, 1, 0, 0, 1]), &*tt2);
        assert_eq!(
            *root(TEST, WIDTH).read_strongly_consistent().await?,
            WIDTH + 2
        );
        assert_eq!(executions(TEST, 0), 2);
        assert_eq!(executions(TEST, 1), 2);
        assert_eq!(executions(TEST, 2), 1);
        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

#[turbo_tasks::value(transparent)]
struct Input(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_input() -> Vc<Input> {
    Input(State::new(0)).cell()
}

#[turbo_tasks::function]
async fn state_dependent(input: ResolvedVc<Input>, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*input.await?.get() + index))
}

#[turbo_tasks::function(operation, root)]
async fn state_root(input: ResolvedVc<Input>, width: u32) -> Result<Vc<u32>> {
    let values = (0..width)
        .map(|index| state_dependent(*input, index))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|value| **value).sum()))
}

/// `State::set` from inside a task with enough dependents to be invalidated in parallel chunks.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn state_set_invalidates_large_fan_out() {
    const WIDTH: u32 = 2_000;
    let expected = |value: u32| (0..WIDTH).map(|index| value + index).sum::<u32>();
    let (tt, _persistence_dir) = create_tt("state_set_invalidates_large_fan_out");
    let result = turbo_tasks::run_once(tt.clone(), async move {
        let input_op = create_input();
        let input = input_op.resolve().strongly_consistent().await?;
        assert_eq!(
            *state_root(input, WIDTH).read_strongly_consistent().await?,
            expected(0)
        );
        input_op.read_strongly_consistent().await?.set(3);
        assert_eq!(
            *state_root(input, WIDTH).read_strongly_consistent().await?,
            expected(3)
        );
        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}
