#![feature(anonymous_lifetime_in_impl_trait)]
#![feature(associated_type_defaults)]
#![feature(iter_collect_into)]
#![feature(box_patterns)]

mod backend;
mod backing_storage;
mod data;
mod data_storage;
mod database;
mod kv_backing_storage;
mod utils;

use std::path::Path;

use anyhow::Result;

use crate::database::{noop_kv::NoopKvDb, turbo::TurboKeyValueDatabase};
pub use crate::{
    backend::{BackendOptions, StorageMode, TurboTasksBackend},
    database::db_versioning::GitVersionInfo,
    kv_backing_storage::KeyValueDatabaseBackingStorage,
};

#[cfg(feature = "lmdb")]
pub type LmdbBackingStorage = KeyValueDatabaseBackingStorage<
    database::read_transaction_cache::ReadTransactionCache<
        database::startup_cache::StartupCacheLayer<
            database::fresh_db_optimization::FreshDbOptimization<
                crate::database::lmdb::LmbdKeyValueDatabase,
            >,
        >,
    >,
>;

#[cfg(feature = "lmdb")]
pub fn lmdb_backing_storage(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<LmdbBackingStorage> {
    use crate::database::{
        fresh_db_optimization::{FreshDbOptimization, is_fresh},
        read_transaction_cache::ReadTransactionCache,
        startup_cache::StartupCacheLayer,
    };

    KeyValueDatabaseBackingStorage::open_versioned_on_disk(
        base_path.to_owned(),
        version_info,
        is_ci,
        |versioned_path| {
            let fresh_db = is_fresh(&versioned_path);
            let database = crate::database::lmdb::LmbdKeyValueDatabase::new(&versioned_path)?;
            let database = FreshDbOptimization::new(database, fresh_db);
            let database =
                StartupCacheLayer::new(database, versioned_path.join("startup.cache"), fresh_db)?;
            Ok(ReadTransactionCache::new(database))
        },
    )
}

#[cfg(feature = "rocksdb")]
pub type RocksDBBackingStorage =
    KeyValueDatabaseBackingStorage<crate::database::rocksdb::RocksDbKeyValueDatabase>;

#[cfg(feature = "rocksdb")]
pub fn rocksdb_backing_storage(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<RocksDBBackingStorage> {
    KeyValueDatabaseBackingStorage::open_versioned_on_disk(
        base_path.to_owned(),
        version_info,
        is_ci,
        |versioned_path| {
            crate::database::rocksdb::RocksDbKeyValueDatabase::new(&versioned_path)
        },
    )
}

pub type TurboBackingStorage = KeyValueDatabaseBackingStorage<TurboKeyValueDatabase>;

pub fn turbo_backing_storage(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<TurboBackingStorage> {
    KeyValueDatabaseBackingStorage::open_versioned_on_disk(
        base_path.to_owned(),
        version_info,
        is_ci,
        TurboKeyValueDatabase::new,
    )
}

pub type NoopBackingStorage = KeyValueDatabaseBackingStorage<NoopKvDb>;

pub fn noop_backing_storage() -> NoopBackingStorage {
    KeyValueDatabaseBackingStorage::new_in_memory(NoopKvDb)
}

#[cfg(feature = "rocksdb")]
pub type DefaultBackingStorage = RocksDBBackingStorage;

#[cfg(feature = "rocksdb")]
pub fn default_backing_storage(
    path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<DefaultBackingStorage> {
    rocksdb_backing_storage(path, version_info, is_ci)
}

#[cfg(feature = "lmdb")]
pub type DefaultBackingStorage = LmdbBackingStorage;

#[cfg(feature = "lmdb")]
pub fn default_backing_storage(
    path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<DefaultBackingStorage> {
    lmdb_backing_storage(path, version_info, is_ci)
}

#[cfg(not(any(feature = "rocksdb", feature = "lmdb")))]
pub type DefaultBackingStorage = TurboBackingStorage;

#[cfg(not(any(feature = "rocksdb", feature = "lmdb")))]
pub fn default_backing_storage(
    path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<DefaultBackingStorage> {
    turbo_backing_storage(path, version_info, is_ci)
}
