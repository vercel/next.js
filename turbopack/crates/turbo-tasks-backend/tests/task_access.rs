#![feature(arbitrary_self_types)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Arc;

use turbo_tasks::{
    TaskId, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, EvictionMode, GitVersionInfo, TurboTasksBackend};

/// Creates a fresh per-call persistence directory rooted under `CARGO_TARGET_TMPDIR/.cache/`.
fn create_test_persistence_dir(name: &str) -> tempfile::TempDir {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    tempfile::Builder::new()
        .prefix(&format!("{name}-"))
        .tempdir_in(&parent)
        .unwrap()
}

/// Opens a backend rooted at `path`.
fn open_tt_at(path: &std::path::Path) -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(2),
            small_preallocation: true,
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            path,
            &GitVersionInfo {
                describe: "test-unversioned",
                dirty: false,
            },
            false,
            true,
            true,
        )
        .unwrap()
        .0,
    ))
}

fn create_tt(name: &str) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let dir = create_test_persistence_dir(name);
    let tt = open_tt_at(dir.path());
    (tt, dir)
}

/// The `TaskId` backing a resolved `Vc` (its `TaskOutput` node).
fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a resolved Vc should be backed by a task")
}

#[turbo_tasks::function]
fn leaf(n: u32) -> Vc<u32> {
    Vc::cell(n)
}

/// `task(.., TaskAccess::MustExist)` must never fabricate: opening a task that exists in neither
/// memory nor persistent storage (a stale reference to an already-collected or never-created task)
/// must **panic** (debug builds) rather than insert and return a blank `TaskStorage` (which would
/// silently corrupt the graph). A real, resident task must open fine.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn task_must_exist_panics_on_nonexistent_task() {
    let (tt, _persistence_dir) = create_tt("task_must_exist_panics_on_nonexistent_task");

    // A real, resident task: a `MustExist` open must succeed.
    let tt2 = tt.clone();
    let real_id = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        anyhow::Ok(task_id_of(leaf(7).resolve().await?))
    })
    .await
    .unwrap();
    tt2.backend().assert_task_exists_for_testing(real_id, &tt2);

    // A synthetic non-transient id that was never created: a `MustExist` open must panic (not
    // fabricate). `catch_unwind` confirms the panic and keeps the test process alive.
    let bogus_id = TaskId::try_from(0x1FFF_FFFF).unwrap();
    assert_ne!(bogus_id, real_id);
    let tt3 = tt.clone();
    let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        tt3.backend().assert_task_exists_for_testing(bogus_id, &tt3);
    }))
    .is_err();
    assert!(
        panicked,
        "task(.., MustExist) on a never-created task must panic, not fabricate a blank task"
    );

    tt.stop_and_wait().await;
}
