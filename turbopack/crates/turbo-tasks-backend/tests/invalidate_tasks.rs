#![feature(arbitrary_self_types)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

mod util;

use std::sync::atomic::{AtomicU32, Ordering};

use turbo_tasks::{TRANSIENT_TASK_BIT, TaskId, Vc, backend::Backend};
use turbo_tasks_backend::TestSnapshotOutcome;

use crate::util::create_tt;

static EXECUTIONS: [AtomicU32; 2] = [AtomicU32::new(0), AtomicU32::new(0)];

#[turbo_tasks::function(operation, root)]
fn leaf(index: u32) -> Vc<u32> {
    // Tasks without an invalidator or dependencies are immutable and must not be invalidated.
    let _ = turbo_tasks::get_invalidator();
    let executions = EXECUTIONS[index as usize].fetch_add(1, Ordering::SeqCst) + 1;
    Vc::cell(executions)
}

/// `Backend::invalidate_tasks` with a batch containing duplicate ids and ids of tasks that don't
/// exist (persistent and transient) invalidates the existing tasks once each and skips the rest.
///
/// Restoring non-resident tasks in a batch is covered by the `try_tasks_*` unit tests in
/// `backend/operation/mod.rs`; eviction here is best-effort, as tasks held by this session may
/// stay resident.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidate_tasks_mixed_batch() {
    let (tt, _persistence_dir) = create_tt("invalidate_tasks_mixed_batch");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let leaves = [leaf(0), leaf(1)];
        for leaf in leaves {
            assert_eq!(*leaf.read_strongly_consistent().await?, 1);
        }

        // Persist the tasks, so the missing persistent id is looked up in a real store, and evict
        // what can be evicted.
        let TestSnapshotOutcome { had_new_data, .. } =
            tt2.backend().snapshot_and_evict_for_testing(&tt2);
        assert!(had_new_data, "snapshot should have persisted data");

        let [a, b] = leaves.map(|leaf| leaf.task_id());
        let missing_persistent = TaskId::new(0x00ff_ffff).unwrap();
        let missing_transient = TaskId::new(TRANSIENT_TASK_BIT | 0x00ff_ffff).unwrap();
        tt2.backend()
            .invalidate_tasks(&[missing_persistent, a, b, b, missing_transient, a], &tt2);

        for leaf in leaves {
            assert_eq!(
                *leaf.read_strongly_consistent().await?,
                2,
                "every existing task re-executes exactly once"
            );
        }

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}
