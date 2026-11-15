#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Serialization invalidation (e.g. mutating a `State` stored in a cell) on a task whose Meta
//! category is not restored must not persist that unrestored (empty) Meta over the real one.

mod util;

use std::sync::atomic::{AtomicU32, Ordering};

use turbo_tasks::{State, Vc};
use turbo_tasks_backend::TestSnapshotOutcome;

use crate::util::create_tt;

static CREATE_STATE_EXECUTIONS: AtomicU32 = AtomicU32::new(0);

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state(initial: u32) -> Vc<Step> {
    CREATE_STATE_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    Step(State::new(initial)).cell()
}

/// 1. Run `create_state`, then snapshot and evict it, so it loses its restored Meta and Data.
/// 2. `state.set` calls `invalidate_serialization` on `create_state`, which only restores Data.
/// 3. Snapshot again. If Meta was (wrongly) marked modified while unrestored, the empty in-memory
///    Meta overwrites the persisted one (losing e.g. the task output).
/// 4. Reading `create_state` again restores Meta from disk and must not re-execute it.
///
/// Nothing reads the state's value (no `State::get`), so `set` invalidates no dependents. A
/// re-executing dependent would read `create_state`'s cell, restoring its Meta before the snapshot
/// and hiding the bug.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidate_serialization_does_not_persist_unrestored_meta() {
    let (tt, _persistence_dir) =
        create_tt("invalidate_serialization_does_not_persist_unrestored_meta");

    let state = turbo_tasks::run_once(tt.clone(), async move {
        let state = create_state(1).read_strongly_consistent().await?;
        assert_eq!(CREATE_STATE_EXECUTIONS.load(Ordering::SeqCst), 1);
        anyhow::Ok(state)
    })
    .await
    .unwrap();

    // Outside of the root task `create_state` is no longer active, so it can be evicted.
    let TestSnapshotOutcome {
        had_new_data,
        eviction_counts,
        ..
    } = tt.backend().snapshot_and_evict_for_testing(&tt);
    assert!(had_new_data, "snapshot should have persisted data");
    assert_eq!(
        eviction_counts.data_and_meta, 1,
        "create_state must lose its restored Data and Meta: {eviction_counts:?}"
    );

    // Mutating the state invalidates the serialization of `create_state`.
    turbo_tasks::run_once(tt.clone(), async move {
        state.set(2);
        anyhow::Ok(())
    })
    .await
    .unwrap();

    let TestSnapshotOutcome { had_new_data, .. } = tt.backend().snapshot_and_evict_for_testing(&tt);
    assert!(
        had_new_data,
        "invalidate_serialization must persist create_state's Data"
    );

    let result = turbo_tasks::run_once(tt.clone(), async move {
        // Restores `create_state`'s Meta from disk. With corrupted Meta the output is gone and
        // the task re-executes.
        create_state(1).read_strongly_consistent().await?;
        assert_eq!(
            CREATE_STATE_EXECUTIONS.load(Ordering::SeqCst),
            1,
            "create_state must not re-execute: its persisted Meta must survive \
             invalidate_serialization"
        );
        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}
