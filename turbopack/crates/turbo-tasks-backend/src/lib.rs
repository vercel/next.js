#![feature(anonymous_lifetime_in_impl_trait)]
#![feature(associated_type_defaults)]
#![feature(iter_collect_into)]
#![feature(box_patterns)]

mod backend;
mod backing_storage;
mod data;
mod database;
mod error;
mod kv_backing_storage;
mod utils;

use std::path::Path;

use anyhow::Result;
use turbo_persistence::{CompactConfig, TurboPersistence};

use crate::database::{
    noop_kv::NoopKvDb,
    turbo::{self, TurboKeyValueDatabase},
};
pub use crate::{
    backend::{BackendOptions, StorageMode, TurboTasksBackend},
    backing_storage::BackingStorage,
    database::{
        db_invalidation,
        db_invalidation::StartupCacheState,
        db_versioning::{GitVersionInfo, handle_db_versioning},
    },
    kv_backing_storage::KeyValueDatabaseBackingStorage,
};

pub type TurboBackingStorage = KeyValueDatabaseBackingStorage<TurboKeyValueDatabase>;

/// Creates a `BackingStorage` to be passed to [`TurboTasksBackend::new`].
///
/// Information about the state of the on-disk cache is returned using [`StartupCacheState`].
pub fn turbo_backing_storage(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
    is_short_session: bool,
    skip_compaction: bool,
) -> Result<(TurboBackingStorage, StartupCacheState)> {
    KeyValueDatabaseBackingStorage::open_versioned_on_disk(
        base_path.to_owned(),
        version_info,
        is_ci,
        |path| TurboKeyValueDatabase::new(path, is_ci, is_short_session, skip_compaction),
    )
}

pub type NoopBackingStorage = KeyValueDatabaseBackingStorage<NoopKvDb>;

/// Creates an no-op in-memory `BackingStorage` to be passed to [`TurboTasksBackend::new`].
pub fn noop_backing_storage() -> NoopBackingStorage {
    KeyValueDatabaseBackingStorage::new_in_memory(NoopKvDb)
}

/// Opens a Turbopack persistent cache database at the given base path and performs a full
/// compaction. This is intended for use by the `next internal post-build` CLI command to optimize
/// the database after a build, without requiring the full turbo-tasks runtime.
///
/// A multi-threaded Tokio runtime is created internally to drive the parallel scheduler.
pub fn compact_database(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<()> {
    let versioned_path = handle_db_versioning(base_path, version_info, is_ci)?;
    // Use the same parallel scheduler as the normal runtime path. This requires a
    // Tokio runtime for `block_in_place` and parallel work-stealing.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let _guard = runtime.enter();
    let db = TurboPersistence::<turbo::TurboTasksParallelScheduler, { turbo::FAMILIES }>::open_with_config(
        versioned_path,
        turbo::DB_CONFIG,
    )?;
    // Fully compact with no segment count limit (unlike the runtime shutdown path
    // which caps segments based on available parallelism).
    db.compact(&CompactConfig {
        max_merge_segment_count: usize::MAX,
        ..turbo::COMPACT_CONFIG
    })?;
    db.shutdown()
}
