#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Tests for keyed cell dependencies with many readers of one keyed cell: invalidation stays
//! correct while dependency edges are registered, reused, cleaned up and invalidated
//! concurrently.

mod util;

use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_tasks::{ResolvedVc, State, TaskId, TryJoinIterExt, Vc};

use crate::util::create_tt_with_workers;

/// Reader executions, per test (tests run concurrently in one process).
static EXECUTIONS: [AtomicU64; 8] = [const { AtomicU64::new(0) }; 8];

fn executions(test: u32) -> u64 {
    EXECUTIONS[test as usize].load(Ordering::SeqCst)
}

#[turbo_tasks::value]
struct Inputs {
    /// Added to every value of the read keys.
    values: State<u32>,
    /// Added to the value of key 0 only.
    one: State<u32>,
    /// The value of the key no reader reads.
    unread: State<u32>,
    /// Readers read keys `(shift % 2) * m .. (shift % 2) * m + m`.
    shift: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn create_inputs(test: u32) -> Vc<Inputs> {
    let _ = test;
    Inputs {
        values: State::new(0),
        one: State::new(0),
        unread: State::new(0),
        shift: State::new(0),
    }
    .cell()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<u32, u32>);

/// Keys `0 .. 2 * m` have the value `values + key` (plus `one` for key 0), the key `2 * m` (read by
/// no reader) has the value `unread`.
#[turbo_tasks::function]
async fn make_map(inputs: ResolvedVc<Inputs>, m: u32) -> Result<Vc<Map>> {
    let inputs = inputs.await?;
    let values = *inputs.values.get();
    let mut map: FxHashMap<u32, u32> = (0..2 * m).map(|key| (key, values + key)).collect();
    *map.get_mut(&0).unwrap() += *inputs.one.get();
    map.insert(2 * m, *inputs.unread.get());
    Ok(Vc::cell(map))
}

/// The id of the task owning the map cell, as a `u32`.
#[turbo_tasks::function(operation, root)]
async fn map_task_id(inputs: ResolvedVc<Inputs>, m: u32) -> Result<Vc<u32>> {
    let map = make_map(*inputs, m).resolve().await?;
    Ok(Vc::cell(
        *Vc::into_raw(map)
            .try_get_task_id()
            .expect("a resolved Vc is backed by a task"),
    ))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// One `keyed_reader()`, then synchronous `get`s.
    KeyedReader = 0,
    /// One `Vc::get` (keyed read) per key.
    Get = 1,
}

#[turbo_tasks::function]
async fn reader(
    map: ResolvedVc<Map>,
    inputs: ResolvedVc<Inputs>,
    test: u32,
    index: u32,
    m: u32,
    mode: u8,
) -> Result<Vc<u64>> {
    let _ = index;
    EXECUTIONS[test as usize].fetch_add(1, Ordering::SeqCst);
    let first = (*inputs.await?.shift.get() % 2) * m;
    let mut sum = 0u64;
    if mode == Mode::KeyedReader as u8 {
        let map = map.keyed_reader().await?;
        for key in first..first + m {
            sum += *map.get(&key).unwrap() as u64;
        }
    } else {
        for key in first..first + m {
            sum += *map.get(&key).await?.unwrap() as u64;
        }
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function(operation, root)]
async fn readers(
    inputs: ResolvedVc<Inputs>,
    test: u32,
    n: u32,
    m: u32,
    mode: u8,
) -> Result<Vc<u64>> {
    let map = make_map(*inputs, m).to_resolved().await?;
    let sums = (0..n)
        .map(|index| reader(*map, *inputs, test, index, m, mode))
        .try_join()
        .await?;
    Ok(Vc::cell(sums.iter().map(|sum| **sum).sum()))
}

/// The sum `readers` returns for the given input values (`one == 0`).
fn expected(n: u32, m: u32, values: u32, shift: u32) -> u64 {
    expected_with_one(n, m, values, 0, shift)
}

/// The sum `readers` returns for the given input values.
fn expected_with_one(n: u32, m: u32, values: u32, one: u32, shift: u32) -> u64 {
    let first = (shift % 2) * m;
    let mut per_reader: u64 = (first..first + m).map(|key| (values + key) as u64).sum();
    if first == 0 {
        per_reader += one as u64;
    }
    n as u64 * per_reader
}

/// Many readers of one keyed cell register (or refine) their keyed dependencies while the cell
/// keeps changing (and invalidating them) concurrently. Afterwards every reader must still depend
/// on its keys: one more change must re-execute all of them and produce the new sum.
async fn check_registration_concurrent_with_changes(test: u32, mode: Mode, name: &str) {
    let (n, m) = (64, 128);
    let (tt, _dir) = create_tt_with_workers(name, 8);
    turbo_tasks::run_once(tt.clone(), async move {
        let inputs_op = create_inputs(test);
        let inputs_vc = inputs_op.resolve().strongly_consistent().await?;
        let inputs = inputs_op.read_strongly_consistent().await?;
        let root = readers(inputs_vc, test, n, m, mode as u8);
        assert_eq!(
            *root.read_strongly_consistent().await?,
            expected(n, m, 0, 0)
        );

        // Change the values while the readers re-execute (and register their dependencies).
        let change = async {
            for value in 1..=100 {
                inputs.values.set(value);
                tokio::time::sleep(Duration::from_micros(200)).await;
            }
        };
        let read = async {
            for _ in 0..20 {
                let _ = root.read_strongly_consistent().await?;
            }
            anyhow::Ok(())
        };
        let ((), read) = tokio::join!(change, read);
        read?;
        assert_eq!(
            *root.read_strongly_consistent().await?,
            expected(n, m, 100, 0)
        );

        // Every reader still depends on its keys.
        let before = executions(test);
        inputs.values.set(1000);
        assert_eq!(
            *root.read_strongly_consistent().await?,
            expected(n, m, 1000, 0)
        );
        assert_eq!(executions(test) - before, n as u64);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn keyed_reader_refinement_concurrent_with_changes() {
    check_registration_concurrent_with_changes(
        0,
        Mode::KeyedReader,
        "keyed_reader_refinement_concurrent_with_changes",
    )
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn keyed_get_registration_concurrent_with_changes() {
    check_registration_concurrent_with_changes(
        1,
        Mode::Get,
        "keyed_get_registration_concurrent_with_changes",
    )
    .await;
}

/// Readers re-execute and read the same keys again, which reuses the existing dependency edges.
/// Afterwards they still depend on exactly these keys: a change of a read key re-executes them, a
/// change of an unread key doesn't, and the owner holds one dependent per edge.
async fn check_reexecution_reuses_edges(test: u32, mode: Mode, name: &str) {
    let (n, m) = (16, 32);
    let (tt, _dir) = create_tt_with_workers(name, 4);
    let tt2 = tt.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        let inputs_op = create_inputs(test);
        let inputs_vc = inputs_op.resolve().strongly_consistent().await?;
        let inputs = inputs_op.read_strongly_consistent().await?;
        let root = readers(inputs_vc, test, n, m, mode as u8);
        assert_eq!(
            *root.read_strongly_consistent().await?,
            expected(n, m, 0, 0)
        );
        let owner = TaskId::try_from(*map_task_id(inputs_vc, m).read_strongly_consistent().await?)?;
        let edges = (n * m) as usize;
        assert_eq!(
            tt2.backend()
                .keyed_cell_dependents_count_for_testing(owner, &tt2),
            edges
        );

        for values in 1..=3 {
            // All values change: every reader re-executes and reads the same keys again.
            let before = executions(test);
            inputs.values.set(values);
            assert_eq!(
                *root.read_strongly_consistent().await?,
                expected(n, m, values, 0)
            );
            assert_eq!(executions(test) - before, n as u64);
            assert_eq!(
                tt2.backend()
                    .keyed_cell_dependents_count_for_testing(owner, &tt2),
                edges
            );
        }

        // A read key changes: every reader depends on it.
        let before = executions(test);
        inputs.one.set(7);
        assert_eq!(
            *root.read_strongly_consistent().await?,
            expected_with_one(n, m, 3, 7, 0)
        );
        assert_eq!(executions(test) - before, n as u64);

        // An unread key changes: no reader depends on it.
        let before = executions(test);
        inputs.unread.set(1);
        assert_eq!(
            *root.read_strongly_consistent().await?,
            expected_with_one(n, m, 3, 7, 0)
        );
        assert_eq!(executions(test) - before, 0);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn keyed_reader_reexecution_reuses_edges() {
    check_reexecution_reuses_edges(
        2,
        Mode::KeyedReader,
        "keyed_reader_reexecution_reuses_edges",
    )
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn keyed_get_reexecution_reuses_edges() {
    check_reexecution_reuses_edges(3, Mode::Get, "keyed_get_reexecution_reuses_edges").await;
}
