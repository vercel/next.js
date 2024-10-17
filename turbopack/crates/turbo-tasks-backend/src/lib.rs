#![feature(anonymous_lifetime_in_impl_trait)]

mod backend;
mod backing_storage;
mod data;
mod database;
mod kv_backing_storage;
mod utils;

use std::path::Path;

pub use self::{backend::TurboTasksBackend, kv_backing_storage::KeyValueDatabaseBackingStorage};
use crate::database::{
    handle_db_versioning, is_fresh, lmdb::LmbdKeyValueDatabase, FreshDbOptimization,
    ReadTransactionCache,
};

pub type LmdbBackingStorage =
    KeyValueDatabaseBackingStorage<ReadTransactionCache<FreshDbOptimization<LmbdKeyValueDatabase>>>;

pub fn lmdb_backing_storage(path: &Path) -> anyhow::Result<LmdbBackingStorage> {
    let path = handle_db_versioning(path)?;
    let fresh_db = is_fresh(&path);
    let database = LmbdKeyValueDatabase::new(&path)?;
    let database = FreshDbOptimization::new(database, fresh_db);
    let database = ReadTransactionCache::new(database);
    Ok(KeyValueDatabaseBackingStorage::new(database))
}
