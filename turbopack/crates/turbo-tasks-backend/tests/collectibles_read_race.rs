#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A task that reads collectibles while they change must not keep the old collectibles.
//!
//! In each round, many readers re-execute and read the collectibles of a shared root operation,
//! while that operation changes its collectibles in the same round. The readers don't wait for the
//! operation, so the collectibles change races with the reads. After a strongly consistent read,
//! every reader must report the current collectibles.
//!
//! The race depends on timing and shows up reliably only when the machine is under CPU load.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, State, ValueToString, Vc, emit};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

const READERS: u32 = 128;
const EMITTED: u32 = 8;
const DEPTH: u32 = 2;
const ROUNDS: u32 = 100;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn readers_see_collectibles_changed_in_the_same_round() {
    run_once(&REGISTRATION, async || {
        let generation = Generation {
            state: State::new(0),
        }
        .resolved_cell();

        for round in 0..ROUNDS {
            generation.await?.state.set(round);
            let results = driver(generation).read_strongly_consistent().await?;
            let expected = expected_collectibles(round);
            for (reader, (reader_generation, collected)) in results.iter().enumerate() {
                assert_eq!(
                    *reader_generation, round,
                    "generation of reader {reader} in round {round}"
                );
                assert_eq!(
                    *collected, expected,
                    "collectibles of reader {reader} in round {round}"
                );
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

fn expected_collectibles(generation: u32) -> Vec<RcStr> {
    let mut names: Vec<RcStr> = (0..EMITTED)
        .map(|index| thing_name(generation, index))
        .collect();
    names.sort();
    names
}

fn thing_name(generation: u32, index: u32) -> RcStr {
    format!("thing {generation}/{index}").into()
}

#[turbo_tasks::value]
struct Generation {
    state: State<u32>,
}

#[turbo_tasks::value]
struct Thing(u32, u32);

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(thing_name(self.0, self.1))
    }
}

/// A chain of `depth` tasks; the end of the chain emits `Thing(generation, index)`.
#[turbo_tasks::function]
async fn child(generation: u32, index: u32, depth: u32) -> Result<Vc<()>> {
    if depth == 0 {
        emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(
            Thing(generation, index).resolved_cell(),
        ));
    } else {
        child(generation, index, depth - 1).await?;
    }
    Ok(Vc::cell(()))
}

/// Emits the collectibles of the current generation through new child tasks.
#[turbo_tasks::function(operation, root)]
async fn emitter(generation: ResolvedVc<Generation>) -> Result<Vc<()>> {
    let generation = *generation.await?.state.get();
    for index in 0..EMITTED {
        child(generation, index, DEPTH).await?;
    }
    Ok(Vc::cell(()))
}

#[turbo_tasks::value(transparent)]
struct ReaderResult((u32, Vec<RcStr>));

/// Re-executes in each round (it reads the generation) and reads the collectibles of `emitter`
/// without waiting for it, so the read races with the collectibles change of the same round.
#[turbo_tasks::function]
async fn reader(generation: ResolvedVc<Generation>, _index: u32) -> Result<Vc<ReaderResult>> {
    let generation_value = *generation.await?.state.get();
    let mut names = Vec::new();
    for collectible in emitter(generation).peek_collectibles::<Box<dyn ValueToString>>() {
        names.push((*collectible.to_string().await?).clone());
    }
    names.sort();
    names.dedup();
    Ok(Vc::cell((generation_value, names)))
}

#[turbo_tasks::value(transparent)]
struct DriverResult(Vec<(u32, Vec<RcStr>)>);

#[turbo_tasks::function(operation, root)]
async fn driver(generation: ResolvedVc<Generation>) -> Result<Vc<DriverResult>> {
    emitter(generation).connect().await?;
    let readers = (0..READERS)
        .map(|index| reader(*generation, index))
        .collect::<Vec<_>>();
    let mut results = Vec::with_capacity(readers.len());
    for reader in readers {
        results.push(reader.owned().await?);
    }
    Ok(Vc::cell(results))
}
