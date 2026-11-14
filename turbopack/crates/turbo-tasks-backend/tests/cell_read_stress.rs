#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Concurrent cell reads of a few hot cells while they change, with GC and eviction in between.
//!
//! Cell reads register their dependency in two separate lock sections (the reader's first, then
//! the cell's task). A lost invalidation would leave a reader with an old value, so the strongly
//! consistent sum over all readers wouldn't match after the changes.
//!
//! Each round switches to a new generation of readers (so the previous generation becomes garbage
//! for the GC) while a writer changes the input concurrently.
//!
//! `CELL_READ_STRESS_ROUNDS` sets the number of rounds per test (default 4).

mod util;

use std::{sync::Arc, time::Duration};

use anyhow::Result;
use futures::try_join;
use rustc_hash::FxHashMap;
use turbo_tasks::{ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::util::create_tt_with_workers_and_gc_ttl;

/// Number of keys in the keyed map.
const KEYS: u32 = 256;
/// Number of keys each reader reads.
const KEYS_PER_READER: u32 = 32;
/// Number of readers per generation.
const READERS: u32 = 96;
/// Number of input changes per round.
const WRITES_PER_ROUND: u32 = 8;

#[turbo_tasks::value]
struct Input {
    base: State<u32>,
    generation: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn create_input() -> Vc<Input> {
    Input {
        base: State::new(0),
        generation: State::new(0),
    }
    .cell()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct KeyedMap(FxHashMap<u32, u32>);

#[turbo_tasks::function]
async fn keyed_map(input: ResolvedVc<Input>) -> Result<Vc<KeyedMap>> {
    let base = *input.await?.base.get();
    Ok(Vc::cell((0..KEYS).map(|k| (k, base + k)).collect()))
}

#[turbo_tasks::function]
async fn plain(input: ResolvedVc<Input>) -> Result<Vc<u32>> {
    let base = *input.await?.base.get();
    Ok(Vc::cell(base))
}

/// `mode`: 0 = `keyed_reader()`, 1 = per-key `get`, 2 = two concurrent reads of the same plain
/// cell and of the same key. `generation` only makes the readers distinct tasks per round.
#[turbo_tasks::function]
async fn reader(
    map: ResolvedVc<KeyedMap>,
    plain: ResolvedVc<u32>,
    first_key: u32,
    mode: u8,
    generation: u32,
) -> Result<Vc<u64>> {
    let _ = generation;
    let keys = (0..KEYS_PER_READER).map(|i| (first_key + i) % KEYS);
    let mut sum = 0u64;
    match mode {
        0 => {
            let reader = map.keyed_reader().await?;
            for key in keys {
                sum += reader.get(&key).copied().unwrap_or_default() as u64;
            }
        }
        1 => {
            for key in keys {
                sum += map.get(&key).await?.as_deref().copied().unwrap_or_default() as u64;
            }
        }
        _ => {
            let plain = *plain;
            let (a, b, c, d) = try_join!(
                plain.into_future(),
                plain.into_future(),
                map.get(&first_key),
                map.get(&first_key)
            )?;
            sum += *a as u64 + *b as u64;
            sum += c.as_deref().copied().unwrap_or_default() as u64;
            sum += d.as_deref().copied().unwrap_or_default() as u64;
        }
    }
    Ok(Vc::cell(sum))
}

/// Reads a new generation of readers when the generation changes, which disconnects the previous
/// generation (garbage for the GC).
#[turbo_tasks::function(operation, root)]
async fn readers_root(input: ResolvedVc<Input>) -> Result<Vc<u64>> {
    let generation = *input.await?.generation.get();
    let map = keyed_map(*input).to_resolved().await?;
    let plain = plain(*input).to_resolved().await?;
    let sums = (0..READERS)
        .map(|index| {
            reader(
                *map,
                *plain,
                (index * 7 + generation) % KEYS,
                (index % 3) as u8,
                generation,
            )
        })
        .try_join()
        .await?;
    Ok(Vc::cell(sums.iter().map(|sum| **sum).sum()))
}

fn expected(base: u32, generation: u32) -> u64 {
    let base = base as u64;
    (0..READERS)
        .map(|index| {
            let first_key = (index * 7 + generation) % KEYS;
            match index % 3 {
                0 | 1 => (0..KEYS_PER_READER)
                    .map(|i| base + ((first_key + i) % KEYS) as u64)
                    .sum::<u64>(),
                _ => 2 * base + 2 * (base + first_key as u64),
            }
        })
        .sum()
}

fn rounds() -> u32 {
    std::env::var("CELL_READ_STRESS_ROUNDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(4)
}

/// Reads the root in a loop, while another task changes the input `WRITES_PER_ROUND` times, so that
/// the readers re-execute while the cells they read change. Then checks the result.
async fn round(tt: &Arc<TurboTasks<TurboTasksBackend>>, generation: u32) {
    let first_base = generation * WRITES_PER_ROUND + 1;
    let last_base = first_base + WRITES_PER_ROUND - 1;
    turbo_tasks::run_once(tt.clone(), async move {
        create_input()
            .read_strongly_consistent()
            .await?
            .generation
            .set(generation);
        anyhow::Ok(())
    })
    .await
    .unwrap();
    let reads = turbo_tasks::run_once(tt.clone(), async move {
        let input = create_input().resolve().strongly_consistent().await?;
        for _ in 0..WRITES_PER_ROUND * 2 {
            let _ = *readers_root(input).read_strongly_consistent().await?;
            tokio::task::yield_now().await;
        }
        anyhow::Ok(())
    });
    let writes = turbo_tasks::run_once(tt.clone(), async move {
        let input = create_input().read_strongly_consistent().await?;
        for base in first_base..=last_base {
            input.base.set(base);
            tokio::task::yield_now().await;
        }
        anyhow::Ok(())
    });
    let (reads, writes) = futures::join!(reads, writes);
    reads.unwrap();
    writes.unwrap();
    let sum = turbo_tasks::run_once(tt.clone(), async move {
        let input = create_input().resolve().strongly_consistent().await?;
        anyhow::Ok(*readers_root(input).read_strongly_consistent().await?)
    })
    .await
    .unwrap();
    assert_eq!(
        sum,
        expected(last_base, generation),
        "generation {generation}"
    );
}

async fn stress(name: &str, workers: usize) {
    let (tt, _dir) = create_tt_with_workers_and_gc_ttl(name, workers, Duration::ZERO);
    let mut collected = 0;
    let mut evicted = 0;
    for generation in 0..rounds() {
        round(&tt, generation).await;
        // GC and eviction between the rounds, so that the edges of earlier generations are
        // collected and the current ones are persisted and restored.
        collected += tt.backend().gc_for_testing(&tt);
        let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
        let counts = &outcome.eviction_counts;
        evicted += counts.full + counts.data_and_meta + counts.data_only + counts.meta_only;
    }
    tt.stop_and_wait().await;
    assert!(collected > 0, "the GC never collected anything");
    assert!(evicted > 0, "nothing was ever evicted");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 16)]
async fn cell_read_stress_16_threads() {
    stress("cell_read_stress_16_threads", 16).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 32)]
async fn cell_read_stress_32_threads() {
    stress("cell_read_stress_32_threads", 32).await;
}
