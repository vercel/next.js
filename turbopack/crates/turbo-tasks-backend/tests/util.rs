//! Shared setup for tests that need a real on-disk persistent backend and direct access to
//! [`TurboTasksBackend`] test hooks (`snapshot_and_evict_for_testing`, `parent_count_for_testing`,
//! …).
//!
//! These tests can't use `turbo_tasks_testing::register!`: that harness hands back an
//! `Arc<dyn TurboTasksApi>`, which erases the concrete backend type and makes `tt.backend()`
//! unreachable. It also owns the session loop (re-running the body and comparing results), whereas
//! these tests need to drive snapshots — and sometimes a DB reopen — on their own schedule.
//!
//! This module is compiled into each test binary separately, so any helper a given binary doesn't
//! call reads as dead code there.
#![allow(dead_code)]

use std::{path::Path, sync::Arc, time::Duration};

use turbo_tasks::TurboTasks;
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, EvictionMode, GitVersionInfo, TurboTasksBackend,
};

/// Opens a backend rooted at `path`.
///
/// Reusing the same `path` (after the previous backend has been stopped) reopens the persisted
/// database, which is how a test can assert that state survives a restart.
fn open_tt_at(path: &Path, num_workers: usize) -> Arc<TurboTasks<TurboTasksBackend>> {
    open_tt_at_with_gc(path, num_workers, Some(true), None)
}

/// Like [`open_tt_at`], but forces the GC on or off for this backend instead of deriving it from
/// the `TURBO_ENGINE_GC` env var, which every test in the binary would share.
///
/// A test that depends on the persisted GC roots map must force it on: the map is only written by
/// the GC branch of `snapshot_and_persist`, so with GC off a session persists an empty root set and
/// the cross-session behaviour under test silently never engages.
fn open_tt_at_with_gc(
    path: &Path,
    num_workers: usize,
    gc: Option<bool>,
    gc_root_ttl: Option<Duration>,
) -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(num_workers),
            small_preallocation: true,
            // Avoid racing with the background snapshot loop; these tests drive
            // snapshot_and_evict_for_testing manually.
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            gc,
            gc_root_ttl,
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            path,
            &GitVersionInfo {
                describe: "test-unversioned",
                dirty: false,
            },
            BackingStorageOptions {
                is_short_session: true,
                skip_compaction: true,
                ..Default::default()
            },
        )
        .unwrap()
        .0,
    ))
}

/// A persistence directory that outlives the backends opened on it, so a test can stop one backend
/// and open another on the same path to simulate a restart.
pub fn create_persistence_dir(name: &str) -> tempfile::TempDir {
    tempfile::Builder::new()
        .prefix(&format!("{name}-"))
        .tempdir()
        .unwrap()
}

/// Opens a new session over an existing persistence directory, with the GC forced on (see
/// [`open_tt_at_with_gc`]). The previous backend must already be stopped so its shutdown snapshot
/// has been flushed.
pub fn reopen_tt_with_gc(dir: &tempfile::TempDir) -> Arc<TurboTasks<TurboTasksBackend>> {
    open_tt_at_with_gc(dir.path(), 2, Some(true), None)
}

/// [`reopen_tt_with_gc`] with the GC root TTL pinned, so a test can age a root out inside the test
/// rather than days later. Set at construction, where the TTL is resolved.
pub fn reopen_tt_with_gc_ttl(
    dir: &tempfile::TempDir,
    gc_root_ttl: Duration,
) -> Arc<TurboTasks<TurboTasksBackend>> {
    open_tt_at_with_gc(dir.path(), 2, Some(true), Some(gc_root_ttl))
}

/// A fresh persistent backend in its own temp directory, with `num_workers` workers.
pub fn create_tt_with_workers(
    name: &str,
    num_workers: usize,
) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let dir = create_persistence_dir(name);
    let tt = open_tt_at(dir.path(), num_workers);
    (tt, dir)
}

/// A fresh persistent backend in its own temp directory, with the default worker count.
pub fn create_tt(name: &str) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    create_tt_with_workers(name, 2)
}
