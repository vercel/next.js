#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A reader depending on many keys of a keyed cell that all change at once is invalidated (and
//! re-executed) exactly once, with the new values.

mod util;

use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_tasks::{ResolvedVc, State, Vc};

use crate::util::create_tt_with_workers;

/// Reader executions, per test (tests run concurrently in one process).
static EXECUTIONS: [AtomicU64; 2] = [const { AtomicU64::new(0) }; 2];

fn executions(test: u32) -> u64 {
    EXECUTIONS[test as usize].load(Ordering::SeqCst)
}

#[turbo_tasks::value]
struct Inputs {
    /// Added to every value of the map.
    values: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn create_inputs(test: u32) -> Vc<Inputs> {
    let _ = test;
    Inputs {
        values: State::new(0),
    }
    .cell()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<u32, u32>);

/// Keys `0 .. m` have the value `values + key`.
#[turbo_tasks::function]
async fn make_map(inputs: ResolvedVc<Inputs>, m: u32) -> Result<Vc<Map>> {
    let values = *inputs.await?.values.get();
    Ok(Vc::cell((0..m).map(|key| (key, values + key)).collect()))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// One `keyed_reader()`, then synchronous `get`s.
    KeyedReader = 0,
    /// One `Vc::get` (keyed read) per key.
    Get = 1,
}

/// Reads all `m` keys of the map.
#[turbo_tasks::function]
async fn reader(map: ResolvedVc<Map>, test: u32, m: u32, mode: u8) -> Result<Vc<u64>> {
    EXECUTIONS[test as usize].fetch_add(1, Ordering::SeqCst);
    let mut sum = 0u64;
    if mode == Mode::KeyedReader as u8 {
        let map = map.keyed_reader().await?;
        for key in 0..m {
            sum += *map.get(&key).unwrap() as u64;
        }
    } else {
        for key in 0..m {
            sum += *map.get(&key).await?.unwrap() as u64;
        }
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function(operation, root)]
async fn root(inputs: ResolvedVc<Inputs>, test: u32, m: u32, mode: u8) -> Result<Vc<u64>> {
    let map = make_map(*inputs, m).to_resolved().await?;
    Ok(reader(*map, test, m, mode))
}

/// The sum `reader` returns for the given input value.
fn expected(m: u32, values: u32) -> u64 {
    (0..m).map(|key| (values + key) as u64).sum()
}

async fn check_many_changed_keys_reexecute_once(test: u32, mode: Mode, name: &str) {
    let m = 64;
    let (tt, _dir) = create_tt_with_workers(name, 4);
    turbo_tasks::run_once(tt.clone(), async move {
        let inputs_op = create_inputs(test);
        let inputs_vc = inputs_op.resolve().strongly_consistent().await?;
        let inputs = inputs_op.read_strongly_consistent().await?;
        let root = root(inputs_vc, test, m, mode as u8);
        assert_eq!(*root.read_strongly_consistent().await?, expected(m, 0));
        for values in 1..=3 {
            // All keys change: the reader depends on each of them, but is invalidated once.
            let before = executions(test);
            inputs.values.set(values);
            assert_eq!(*root.read_strongly_consistent().await?, expected(m, values));
            assert_eq!(executions(test) - before, 1);
        }
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn keyed_reader_many_changed_keys_reexecute_once() {
    check_many_changed_keys_reexecute_once(
        0,
        Mode::KeyedReader,
        "keyed_reader_many_changed_keys_reexecute_once",
    )
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn keyed_get_many_changed_keys_reexecute_once() {
    check_many_changed_keys_reexecute_once(
        1,
        Mode::Get,
        "keyed_get_many_changed_keys_reexecute_once",
    )
    .await;
}
