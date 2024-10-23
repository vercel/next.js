#![feature(anonymous_lifetime_in_impl_trait)]
#![feature(associated_type_defaults)]
#![feature(iter_collect_into)]

mod backend;
mod backing_storage;
mod data;
pub mod database;
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
    crate::database::read_transaction_cache::ReadTransactionCache<
        crate::database::startup_cache::StartupCacheLayer<
            FreshDbOptimization<crate::database::lmdb::LmbdKeyValueDatabase>,
        >,
    >,
>;

#[cfg(feature = "lmdb")]
pub fn lmdb_backing_storage(path: &Path) -> Result<LmdbBackingStorage> {
    use crate::database::{
        fresh_db_optimization::{is_fresh, FreshDbOptimization},
        read_transaction_cache::ReadTransactionCache,
        startup_cache::StartupCacheLayer,
    };

    let path = handle_db_versioning(path)?;
    let fresh_db = is_fresh(&path);
    let database = crate::database::lmdb::LmbdKeyValueDatabase::new(&path)?;
    let database = FreshDbOptimization::new(database, fresh_db);
    let database = StartupCacheLayer::new(database, path.join("startup.cache"), fresh_db)?;
    let database = ReadTransactionCache::new(database);
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

#[cfg(feature = "rocksdb")]
pub type RocksDBBackingStorage =
    KeyValueDatabaseBackingStorage<crate::database::rocksdb::RocksDbKeyValueDatabase>;

#[cfg(feature = "rocksdb")]
pub fn rocksdb_backing_storage(path: &Path) -> Result<RocksDBBackingStorage> {
    let path = handle_db_versioning(path)?;
    let database = crate::database::rocksdb::RocksDbKeyValueDatabase::new(&path)?;
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

pub type TurboBackingStorage = KeyValueDatabaseBackingStorage<TurboKeyValueDatabase>;

pub fn turbo_backing_storage(path: &Path) -> Result<TurboBackingStorage> {
    let path = handle_db_versioning(path)?;
    let database = TurboKeyValueDatabase::new(path)?;
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

pub type NoopBackingStorage = KeyValueDatabaseBackingStorage<NoopKvDb>;

pub fn noop_backing_storage() -> NoopBackingStorage {
    KeyValueDatabaseBackingStorage::new(NoopKvDb)
}

#[cfg(feature = "rocksdb")]
pub type DefaultBackingStorage = RocksDBBackingStorage;

#[cfg(feature = "rocksdb")]
pub fn default_backing_storage(path: &Path) -> Result<DefaultBackingStorage> {
    rocksdb_backing_storage(path)
}

#[cfg(feature = "lmdb")]
pub type DefaultBackingStorage = LmdbBackingStorage;

#[cfg(feature = "lmdb")]
pub fn default_backing_storage(path: &Path) -> Result<DefaultBackingStorage> {
    rocksdb_backing_storage(path)
}

#[cfg(not(any(feature = "rocksdb", feature = "lmdb")))]
pub type DefaultBackingStorage = TurboBackingStorage;

#[cfg(not(any(feature = "rocksdb", feature = "lmdb")))]
pub fn default_backing_storage(path: &Path) -> Result<DefaultBackingStorage> {
    turbo_backing_storage(path)
}
