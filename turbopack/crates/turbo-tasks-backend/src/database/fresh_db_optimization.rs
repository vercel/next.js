use std::{fs, path::Path};

use anyhow::Result;

use crate::database::key_value_database::KeyValueDatabase;

pub fn is_fresh(path: &Path) -> bool {
    fs::exists(&path).map_or(false, |exists| !exists)
}

pub struct FreshDbOptimization<T: KeyValueDatabase> {
    database: T,
    fresh_db: bool,
}

impl<T: KeyValueDatabase> FreshDbOptimization<T> {
    pub fn new(database: T, fresh_db: bool) -> Self {
        Self { database, fresh_db }
    }
}

impl<T: KeyValueDatabase> KeyValueDatabase for FreshDbOptimization<T> {
    type ReadTransaction<'l>
        = T::ReadTransaction<'l>
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        T::lower_read_transaction(tx)
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        self.database.begin_read_transaction()
    }

    fn get<'txn, 'db: 'txn>(
        &self,
        transaction: &'txn Self::ReadTransaction<'db>,
        key_space: super::key_value_database::KeySpace,
        key: &[u8],
    ) -> anyhow::Result<Option<std::borrow::Cow<'txn, [u8]>>> {
        if self.fresh_db {
            // Performance optimization when the database was empty
            // It's assumed that no cache entries are removed from the memory cache, but we
            // might change that in future.
            return Ok(None);
        }
        self.database.get(transaction, key_space, key)
    }

    type WriteBatch<'l>
        = T::WriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::WriteBatch<'_>> {
        self.database.write_batch()
    }
}
