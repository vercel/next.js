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
use turbo_persistence::{
    CompactConfig, DbConfig, FamilyConfig, FamilyKind, SerialScheduler, TurboPersistence,
};

use crate::database::{noop_kv::NoopKvDb, turbo::TurboKeyValueDatabase};
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

/// Number of key families, see KeySpace enum for their numbers.
const COMPACT_FAMILIES: usize = 4;

const MB: u64 = 1024 * 1024;

/// Opens a Turbopack persistent cache database at the given base path and performs a full
/// compaction. This is intended for use by the `next internal post-build` CLI command to optimize
/// the database after a build, without requiring the full turbo-tasks runtime.
pub fn compact_database(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<()> {
    let versioned_path = handle_db_versioning(base_path, version_info, is_ci)?;
    let config: DbConfig<COMPACT_FAMILIES> = DbConfig {
        family_configs: [
            FamilyConfig {
                kind: FamilyKind::SingleValue,
            },
            FamilyConfig {
                kind: FamilyKind::SingleValue,
            },
            FamilyConfig {
                kind: FamilyKind::SingleValue,
            },
            FamilyConfig {
                kind: FamilyKind::MultiValue,
            },
        ],
    };
    let db = TurboPersistence::<SerialScheduler, COMPACT_FAMILIES>::open_with_config(
        versioned_path,
        config,
    )?;
    db.compact(&CompactConfig {
        min_merge_count: 3,
        optimal_merge_count: 8,
        max_merge_count: 64,
        max_merge_bytes: 512 * MB,
        min_merge_duplication_bytes: 50 * MB,
        optimal_merge_duplication_bytes: 100 * MB,
        max_merge_segment_count: usize::MAX,
    })?;
    db.shutdown()
}
