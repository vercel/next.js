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

use crate::database::{noop_kv::NoopKvDb, turbo::TurboKeyValueDatabase};
pub use crate::{
    backend::{BackendOptions, StorageMode, TurboTasksBackend},
    backing_storage::BackingStorage,
    database::{
        db_invalidation, db_invalidation::StartupCacheState, db_versioning::GitVersionInfo,
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
) -> Result<(TurboBackingStorage, StartupCacheState)> {
    KeyValueDatabaseBackingStorage::open_versioned_on_disk(
        base_path.to_owned(),
        version_info,
        is_ci,
        |path| TurboKeyValueDatabase::new(path, is_ci, is_short_session),
    )
}

pub type NoopBackingStorage = KeyValueDatabaseBackingStorage<NoopKvDb>;

/// Creates an no-op in-memory `BackingStorage` to be passed to [`TurboTasksBackend::new`].
pub fn noop_backing_storage() -> NoopBackingStorage {
    KeyValueDatabaseBackingStorage::new_in_memory(NoopKvDb)
}
