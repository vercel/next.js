#![feature(anonymous_lifetime_in_impl_trait)]

mod backend;
mod backing_storage;
mod data;
pub mod database;
mod kv_backing_storage;
mod utils;

use std::path::Path;

use anyhow::Result;

pub use self::{backend::TurboTasksBackend, kv_backing_storage::KeyValueDatabaseBackingStorage};
use crate::database::NoopKvDb;

#[cfg(feature = "lmdb")]
pub type LmdbBackingStorage = KeyValueDatabaseBackingStorage<
    crate::database::ReadTransactionCache<
        crate::database::StartupCacheLayer<
            crate::database::FreshDbOptimization<crate::database::LmbdKeyValueDatabase>,
        >,
    >,
>;

#[cfg(feature = "lmdb")]
pub fn lmdb_backing_storage(path: &Path) -> Result<LmdbBackingStorage> {
    let path = crate::database::handle_db_versioning(path)?;
    let fresh_db = crate::database::is_fresh(&path);
    let database = crate::database::LmbdKeyValueDatabase::new(&path)?;
    let database = crate::database::FreshDbOptimization::new(database, fresh_db);
    let database =
        crate::database::StartupCacheLayer::new(database, path.join("startup.cache"), fresh_db)?;
    let database = crate::database::ReadTransactionCache::new(database);
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

#[cfg(feature = "rocksdb")]
pub type RocksDBBackingStorage =
    KeyValueDatabaseBackingStorage<crate::database::RocksDbKeyValueDatabase>;

#[cfg(feature = "rocksdb")]
pub fn rocksdb_backing_storage(path: &Path) -> Result<RocksDBBackingStorage> {
    let path = crate::database::handle_db_versioning(path)?;
    let database = crate::database::RocksDbKeyValueDatabase::new(&path)?;
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

pub type NoopBackingStorage = KeyValueDatabaseBackingStorage<NoopKvDb>;

pub fn noop_backing_storage(_path: &Path) -> Result<NoopBackingStorage> {
    Ok(KeyValueDatabaseBackingStorage::new(NoopKvDb))
}

#[cfg(feature = "rocksdb")]
pub type DefaultBackingStorage = RocksDBBackingStorage;

#[cfg(feature = "rocksdb")]
pub fn default_backing_storage(path: &Path) -> Result<DefaultBackingStorage> {
    rocksdb_backing_storage(path)
}

#[cfg(all(not(feature = "rocksdb"), feature = "lmdb"))]
pub type DefaultBackingStorage = LmdbBackingStorage;

#[cfg(all(not(feature = "rocksdb"), feature = "lmdb"))]
pub fn default_backing_storage(path: &Path) -> Result<DefaultBackingStorage> {
    rocksdb_backing_storage(path)
}
