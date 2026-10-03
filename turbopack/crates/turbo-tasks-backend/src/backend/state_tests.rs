use anyhow::Result;
use turbo_tasks::{StateOwnerRoot, StateSlot, TurboTasks, TurboTasksState, Vc};

use crate::{
    BackendOptions,
    backend::{TaskDataCategory, TurboTasksBackend, storage_schema::TaskStorageAccessors},
};

#[turbo_tasks::state]
static COUNTER: StateSlot<u32> = StateSlot::new();

#[turbo_tasks::function(operation, root)]
fn reader(state: TurboTasksState<u32>) -> Vc<u32> {
    Vc::cell(state.get())
}

/// Inspect the captured batch itself, not just restored values: unchanged rows
/// must be absent, and transient identities/dependents cannot cross a restart.
#[tokio::test(flavor = "multi_thread")]
async fn incremental_capture_and_explicit_reader_mutability() -> Result<()> {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        crate::noop_backing_storage(),
    ));
    let test_tt = tt.clone();
    turbo_tasks::run_once(tt.clone(), async move {
        let root = StateOwnerRoot::named("state-batch-test".into());
        let a = COUNTER.for_named_owner(&root, 1);
        let b = COUNTER.for_named_owner(&StateOwnerRoot::named("other".into()), 2);
        let transient = COUNTER.for_current_task(3);
        let task = reader(a);
        assert_eq!(*task.read_strongly_consistent().await?, 1);
        {
            let mut ctx = test_tt.backend().execute_context(&test_tt);
            let task = ctx.task(task.task_id(), TaskDataCategory::Data);
            assert!(!task.invalidator());
            assert!(!task.immutable());
            assert!(!task.is_state_dependencies_empty());
        }
        // This transient root becomes a reverse dependent but is excluded from
        // the durable record, as is the transient state itself.
        a.get();
        let first = test_tt.backend().states.lock().snapshot()?.unwrap();
        assert_eq!(first.updates.len(), 2);
        assert!(first.updates.iter().all(|(key, _)| key != transient.key()));
        for (_, bytes) in first.updates {
            let record: crate::backend::PersistedState =
                turbo_bincode::turbo_bincode_decode(&bytes.unwrap())?;
            assert!(record.dependents.iter().all(|id| !id.is_transient()));
        }
        assert!(test_tt.backend().states.lock().snapshot()?.is_none());
        a.set(10);
        let update = test_tt.backend().states.lock().snapshot()?.unwrap();
        assert_eq!(update.updates.len(), 1);
        assert_eq!(update.updates[0].0, *a.key());
        // Re-reading the same edge and no-op writes produce no state row work.
        a.set(10);
        a.get();
        assert!(test_tt.backend().states.lock().snapshot()?.is_none());
        assert_eq!(b.get_untracked(), 2);
        anyhow::Ok(())
    })
    .await?;
    tt.stop_and_wait().await;
    Ok(())
}
