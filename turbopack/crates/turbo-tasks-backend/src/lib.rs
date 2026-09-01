#![feature(anonymous_lifetime_in_impl_trait)]
#![feature(deref_patterns)]

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

use crate::database::turbo::{self, TurboKeyValueDatabase};
pub use crate::{
    backend::{BackendOptions, EvictionMode, StorageMode, TurboTasksBackend},
    database::{
        db_invalidation,
        db_invalidation::StartupCacheState,
        db_versioning::{GitVersionInfo, handle_db_versioning},
    },
    kv_backing_storage::TurboBackingStorage,
};

/// Options controlling how the on-disk persistent cache database is opened and compacted.
#[derive(Clone, Copy, Debug, Default)]
pub struct BackingStorageOptions {
    /// Whether the process is running in a CI environment. Enables more aggressive (full)
    /// compaction on shutdown to reduce the size of the cache that gets uploaded.
    pub is_ci: bool,
    /// Whether this is a short-lived session (e.g. a single build). Disables background
    /// persistence during the session
    pub is_short_session: bool,
    /// Whether to skip database compaction on shutdown entirely
    pub skip_compaction: bool,
}

/// Creates a `BackingStorage` to be passed to [`TurboTasksBackend::new`].
///
/// Information about the state of the on-disk cache is returned using [`StartupCacheState`].
pub fn turbo_backing_storage(
    base_path: &Path,
    version_info: &GitVersionInfo,
    options: BackingStorageOptions,
) -> Result<(TurboBackingStorage, StartupCacheState)> {
    TurboBackingStorage::open_versioned_on_disk(
        base_path.to_owned(),
        version_info,
        options.is_ci,
        |path| TurboKeyValueDatabase::new(path, options),
    )
}

/// Creates an in-memory `BackingStorage` to be passed to [`TurboTasksBackend::new`]. Backed by
/// an empty, read-only [`TurboPersistence`] — reads return `None`, writes are not expected
/// (callers should set [`BackendOptions::storage_mode`] to `None`).
pub fn noop_backing_storage() -> TurboBackingStorage {
    TurboBackingStorage::new_in_memory(TurboKeyValueDatabase::empty_in_memory())
}

/// Opens a Turbopack persistent cache database at the given base path and performs a full
/// compaction. This is intended for use by the `next internal post-build` CLI command to optimize
/// the database after a build, without requiring the full turbo-tasks runtime.
///
/// The parallel scheduler requires a Tokio runtime. If one is already active (e.g. when called
/// from a NAPI async function), it is reused. Otherwise a new multi-threaded runtime is created.
pub fn compact_database(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<()> {
    let versioned_path = handle_db_versioning(base_path, version_info, is_ci)?;
    // The parallel scheduler uses `tokio::task::block_in_place` internally, which
    // requires a multi-threaded Tokio runtime. Create one only if there is no
    // active runtime (e.g. when called from a standalone CLI context).
    let _owned_runtime = if tokio::runtime::Handle::try_current().is_ok() {
        None
    } else {
        Some(
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()?,
        )
    };
    // If we created a runtime, enter it so the scheduler can find it.
    let _guard = _owned_runtime.as_ref().map(|rt| rt.enter());
    let db =
        TurboPersistence::<turbo::TurboTasksParallelScheduler, { turbo::FAMILIES }>::open_with_config(
            versioned_path,
            turbo::db_config(),
        )?;
    // Fully compact with no segment count limit (unlike the runtime shutdown path
    // which caps segments based on available parallelism).
    db.compact(&CompactConfig {
        max_merge_segment_count: usize::MAX,
        ..turbo::COMPACT_CONFIG
    })?;
    db.shutdown()
}
