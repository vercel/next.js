#![feature(anonymous_lifetime_in_impl_trait)]

mod backend;
mod backing_storage;
mod data;
mod database;
mod kv_backing_storage;
mod utils;

use std::path::Path;

use anyhow::Result;

pub use self::{backend::TurboTasksBackend, kv_backing_storage::KeyValueDatabaseBackingStorage};
use crate::database::{
    handle_db_versioning, is_fresh, lmdb::LmbdKeyValueDatabase, FreshDbOptimization, NoopKvDb,
    ReadTransactionCache, StartupCacheLayer,
};

pub type LmdbBackingStorage = KeyValueDatabaseBackingStorage<
    ReadTransactionCache<StartupCacheLayer<FreshDbOptimization<LmbdKeyValueDatabase>>>,
>;

pub fn lmdb_backing_storage(path: &Path) -> Result<LmdbBackingStorage> {
    let path = handle_db_versioning(path)?;
    let fresh_db = is_fresh(&path);
    let database = LmbdKeyValueDatabase::new(&path)?;
    let database = FreshDbOptimization::new(database, fresh_db);
    let database = StartupCacheLayer::new(database, path.join("startup.cache"), fresh_db)?;
    let database = ReadTransactionCache::new(database);
    Ok(KeyValueDatabaseBackingStorage::new(database))
}

pub type NoopBackingStorage = KeyValueDatabaseBackingStorage<NoopKvDb>;

pub fn noop_backing_storage(_path: &Path) -> Result<NoopBackingStorage> {
    Ok(KeyValueDatabaseBackingStorage::new(NoopKvDb))
}

pub type DefaultBackingStorage = LmdbBackingStorage;

pub fn default_backing_storage(path: &Path) -> Result<DefaultBackingStorage> {
    lmdb_backing_storage(path)
}
