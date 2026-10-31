#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Many tasks reading the same Vcs while the Vcs change. Exercises the shared-lock read fast paths
//! (repeated tracked reads, re-executions with existing dependency edges, immutable and untracked
//! reads) and checks that no invalidation is lost.

use std::time::Duration;

use anyhow::{Result, bail};
use rustc_hash::FxHashMap;
use turbo_tasks::{ResolvedVc, State, TryJoinIterExt, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

const WIDTH: u32 = 256;
const ROUNDS: u32 = 40;
/// Value a reader reports when its source failed.
const ERROR: u32 = u32::MAX;

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::value(transparent)]
struct Values(Vec<u32>);

#[turbo_tasks::value(transparent)]
struct OptValue(Option<u32>);

#[turbo_tasks::value(transparent)]
struct OptValues(Vec<Option<u32>>);

#[turbo_tasks::function(operation, root)]
fn create_step() -> Vc<Step> {
    Step(State::new(0)).cell()
}

/// Sets `step` to `base`, then keeps changing it while `read` runs, so updates race with readers
/// that are executing. Returns the last value set.
async fn race_updates<F: Future<Output = Result<()>>>(
    step: &State<u32>,
    base: u32,
    read: F,
) -> u32 {
    step.set(base);
    let updates = async {
        let mut last = base;
        for i in 1..=3 {
            tokio::time::sleep(Duration::from_micros(200 * i as u64)).await;
            last = base + i;
            step.set(last);
        }
        last
    };
    let (read_result, last) = futures::join!(read, updates);
    // Errors are fine here (the root may read a deliberate error state), only the final,
    // strongly consistent read is checked.
    let _ = read_result;
    last
}

// --- Tracked cell and output reads ---

#[turbo_tasks::function]
async fn forward(step: ResolvedVc<Step>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*step.await?.get() * 10))
}

/// Changes cell content, output identity (own cell vs. another task's output) and errors.
#[turbo_tasks::function]
async fn source(step: ResolvedVc<Step>) -> Result<Vc<u32>> {
    let value = *step.await?.get();
    if value % 7 == 6 {
        bail!("error state {value}");
    }
    if value % 2 == 0 {
        Ok(forward(*step))
    } else {
        Ok(Vc::cell(value * 10))
    }
}

fn expected_source(value: u32) -> u32 {
    if value % 7 == 6 { ERROR } else { value * 10 }
}

#[turbo_tasks::function]
async fn tracked_reader(step: ResolvedVc<Step>, index: u32) -> Result<Vc<u32>> {
    let source = source(*step);
    let mut last = 0;
    // Read repeatedly: the first read creates the dependency edges, the following reads (and
    // reads after re-executions) find them already in place.
    for _ in 0..4 {
        last = match source.await {
            Ok(value) => *value,
            Err(_) => ERROR,
        };
    }
    Ok(Vc::cell(if last == ERROR { ERROR } else { last + index }))
}

#[turbo_tasks::function(operation, root)]
async fn tracked_root(step: ResolvedVc<Step>) -> Result<Vc<Values>> {
    let values = (0..WIDTH)
        .map(|index| tracked_reader(*step, index))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|v| **v).collect()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn tracked_readers_see_latest_value() {
    run(&REGISTRATION, async || {
        let step_op = create_step();
        let step_vc = step_op.resolve().strongly_consistent().await?;
        let step = step_op.read_strongly_consistent().await?;
        let root = tracked_root(step_vc);
        root.read_strongly_consistent().await?;

        for round in 0..ROUNDS {
            let last = race_updates(&step, round * 4, async {
                root.read_strongly_consistent().await?;
                Ok(())
            })
            .await;
            let values = root.read_strongly_consistent().await?;
            let expected = expected_source(last);
            for (index, value) in values.iter().enumerate() {
                let expected = if expected == ERROR {
                    ERROR
                } else {
                    expected + index as u32
                };
                assert_eq!(
                    *value, expected,
                    "round {round}: reader {index} is stale (state = {last})"
                );
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- Keyed cell reads ---

#[turbo_tasks::value(transparent, cell = "keyed")]
struct Map(FxHashMap<u32, u32>);

const KEYS: u32 = 16;

/// Key `k` is present unless `(value + k) % 5 == 0`, and its value depends on `value` for every
/// third key only, so only some keys change in each update.
fn expected_entry(value: u32, key: u32) -> Option<u32> {
    if (value + key).is_multiple_of(5) {
        None
    } else if key.is_multiple_of(3) {
        Some(value * 100 + key)
    } else {
        Some(key)
    }
}

#[turbo_tasks::function]
async fn map(step: ResolvedVc<Step>) -> Result<Vc<Map>> {
    let value = *step.await?.get();
    Ok(Vc::cell(
        (0..KEYS)
            .filter_map(|key| expected_entry(value, key).map(|v| (key, v)))
            .collect(),
    ))
}

#[turbo_tasks::function]
async fn keyed_reader(step: ResolvedVc<Step>, index: u32) -> Result<Vc<OptValue>> {
    let map = map(*step);
    let key = index % KEYS;
    let mut last = None;
    for _ in 0..3 {
        last = map.get(&key).await?.as_deref().copied();
    }
    Ok(Vc::cell(last))
}

#[turbo_tasks::function(operation, root)]
async fn keyed_root(step: ResolvedVc<Step>) -> Result<Vc<OptValues>> {
    let values = (0..WIDTH)
        .map(|index| keyed_reader(*step, index))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|v| **v).collect()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn keyed_readers_see_latest_value() {
    run(&REGISTRATION, async || {
        let step_op = create_step();
        let step_vc = step_op.resolve().strongly_consistent().await?;
        let step = step_op.read_strongly_consistent().await?;
        let root = keyed_root(step_vc);
        root.read_strongly_consistent().await?;

        for round in 0..ROUNDS {
            let last = race_updates(&step, round * 4, async {
                root.read_strongly_consistent().await?;
                Ok(())
            })
            .await;
            let values = root.read_strongly_consistent().await?;
            for (index, value) in values.iter().enumerate() {
                let key = index as u32 % KEYS;
                assert_eq!(
                    *value,
                    expected_entry(last, key),
                    "round {round}: keyed reader {index} (key {key}) is stale (state = {last})"
                );
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- Immutable reads ---

#[turbo_tasks::function]
fn immutable_source(key: u32) -> Vc<u32> {
    Vc::cell(key * 3)
}

#[turbo_tasks::function]
async fn immutable_reader(seed: u32, index: u32) -> Result<Vc<u32>> {
    let _ = seed;
    let source = immutable_source(index % 4);
    let mut sum = 0;
    for _ in 0..4 {
        sum += *source.await?;
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function(operation, root)]
async fn immutable_root(seed: u32) -> Result<Vc<Values>> {
    let values = (0..WIDTH)
        .map(|index| immutable_reader(seed, index))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|v| **v).collect()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn immutable_shared_reads() {
    run(&REGISTRATION, async || {
        for seed in 0..8 {
            let values = immutable_root(seed).read_strongly_consistent().await?;
            for (index, value) in values.iter().enumerate() {
                assert_eq!(*value, 4 * 3 * (index as u32 % 4), "reader {index}");
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// --- Untracked reads ---

#[turbo_tasks::function]
async fn untracked_reader(step: ResolvedVc<Step>, seed: u32, index: u32) -> Result<Vc<u32>> {
    let _ = (seed, index);
    let source = source(*step);
    let mut last = 0;
    for _ in 0..4 {
        last = match source.untracked().await {
            Ok(value) => *value,
            Err(_) => ERROR,
        };
    }
    Ok(Vc::cell(last))
}

#[turbo_tasks::function(operation, root)]
async fn untracked_root(step: ResolvedVc<Step>, seed: u32) -> Result<Vc<Values>> {
    let values = (0..WIDTH)
        .map(|index| untracked_reader(*step, seed, index))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|v| **v).collect()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn untracked_shared_reads() {
    run(&REGISTRATION, async || {
        let step_op = create_step();
        let step_vc = step_op.resolve().strongly_consistent().await?;
        let step = step_op.read_strongly_consistent().await?;
        // Keep a tracked reader of `source` around, so `source` gets recomputed on every change.
        let tracked = tracked_root(step_vc);
        tracked.read_strongly_consistent().await?;

        for round in 0..ROUNDS {
            let base = round * 4;
            let last = race_updates(&step, base, async {
                untracked_root(step_vc, round)
                    .read_strongly_consistent()
                    .await?;
                Ok(())
            })
            .await;
            tracked.read_strongly_consistent().await?;
            // Untracked reads don't propagate invalidations, so only check that every value is one
            // the source had at some point.
            let values = untracked_root(step_vc, round)
                .read_strongly_consistent()
                .await?;
            for (index, value) in values.iter().enumerate() {
                assert!(
                    *value == ERROR || (*value % 10 == 0 && *value / 10 <= last),
                    "round {round}: untracked reader {index} read an impossible value {value}"
                );
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
