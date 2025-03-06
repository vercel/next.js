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

pub use self::{
    backend::{BackendOptions, StorageMode, TurboTasksBackend},
    kv_backing_storage::KeyValueDatabaseBackingStorage,
};
use crate::database::{
    db_versioning::handle_db_versioning, noop_kv::NoopKvDb, turbo::TurboKeyValueDatabase,
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
pub fn lmdb_backing_storage(path: &Path, version_info: &str) -> Result<LmdbBackingStorage> {
    use crate::database::{
        fresh_db_optimization::{is_fresh, FreshDbOptimization},
        read_transaction_cache::ReadTransactionCache,
        startup_cache::StartupCacheLayer,
    };

    let path = handle_db_versioning(path, version_info)?;
    let fresh_db = is_fresh(&path);
    let database = crate::database::lmdb::LmbdKeyValueDatabase::new(&path)?;
    let database = FreshDbOptimization::new(database, fresh_db);
    let database = StartupCacheLayer::new(database, path.join("startup.cache"), fresh_db)?;
    let database = ReadTransactionCache::new(database);
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

pub type TurboBackingStorage = KeyValueDatabaseBackingStorage<TurboKeyValueDatabase>;

pub fn turbo_backing_storage(path: &Path, version_info: &str) -> Result<TurboBackingStorage> {
    let path = handle_db_versioning(path, version_info)?;
    let database = TurboKeyValueDatabase::new(path)?;
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

pub type NoopBackingStorage = KeyValueDatabaseBackingStorage<NoopKvDb>;

pub fn noop_backing_storage() -> NoopBackingStorage {
    KeyValueDatabaseBackingStorage::new(NoopKvDb)
}

#[cfg(feature = "lmdb")]
pub type DefaultBackingStorage = LmdbBackingStorage;

#[cfg(feature = "lmdb")]
pub fn default_backing_storage(path: &Path, version_info: &str) -> Result<DefaultBackingStorage> {
    lmdb_backing_storage(path, version_info)
}

#[cfg(not(feature = "lmdb"))]
pub type DefaultBackingStorage = TurboBackingStorage;

#[cfg(not(feature = "lmdb"))]
pub fn default_backing_storage(path: &Path, version_info: &str) -> Result<DefaultBackingStorage> {
    turbo_backing_storage(path, version_info)
}
