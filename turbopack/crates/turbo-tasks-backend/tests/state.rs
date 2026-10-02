#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

mod util;

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, Vc};

use crate::util::{create_persistence_dir, reopen_tt_without_gc};

/// A reader that first registers with a `State` *after* the cell holding it was persisted must
/// still be invalidated once that cell is restored from disk.
///
/// `State::get()` records the reader's invalidator inside the cell, and the invalidator set is
/// persisted with it. If registering doesn't mark the cell for re-serialization, the next snapshot
/// keeps the old bytes, and the `State` restored from them has forgotten the reader — so a later
/// `set` never invalidates it and it serves a stale value.
///
/// Each session is a fresh backend over the same persistence directory, so every read in it comes
/// from disk. Eviction drops the in-memory copy the same way.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn state_reader_registered_after_persisting() {
    let dir = create_persistence_dir("state_reader_registered_after_persisting");

    // Create the state and persist it before anyone has read it.
    {
        let tt = reopen_tt_without_gc(&dir);
        let result = turbo_tasks::run_once(tt.clone(), async move {
            create_state(1).resolve().strongly_consistent().await?;
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }

    // The reader registers with the `State` restored from disk. That registration exists only in
    // memory until something re-serializes the cell.
    {
        let tt = reopen_tt_without_gc(&dir);
        let result = turbo_tasks::run_once(tt.clone(), async move {
            let state_vc = create_state(1).resolve().strongly_consistent().await?;
            let read = compute(state_vc).read_strongly_consistent().await?;
            assert_eq!(*read, 1);
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }

    {
        let tt = reopen_tt_without_gc(&dir);
        let result = turbo_tasks::run_once(tt.clone(), async move {
            let state_op = create_state(1);
            let state_vc = state_op.resolve().strongly_consistent().await?;
            state_op.read_strongly_consistent().await?.set(2);

            let read = compute(state_vc).read_strongly_consistent().await?;
            assert_eq!(
                *read, 2,
                "the reader was not invalidated: its registration with the State was not persisted"
            );
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }
}

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state(initial: u32) -> Vc<Step> {
    Step(State::new(initial)).cell()
}

#[turbo_tasks::function(operation, root)]
async fn compute(input: ResolvedVc<Step>) -> Result<Vc<u32>> {
    Ok(Vc::cell(input.await?.get()))
}
