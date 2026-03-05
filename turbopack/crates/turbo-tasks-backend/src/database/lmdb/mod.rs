use std::{fs::create_dir_all, marker::PhantomData, path::Path, thread::available_parallelism};

use anyhow::{Context, Result};
use lmdb::{
    Database, DatabaseFlags, Environment, EnvironmentFlags, RwTransaction, Transaction, WriteFlags,
};

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, SerialWriteBatch, WriteBatch, WriteBuffer},
};

mod extended_key;
mod read_tx_cache;

pub struct LmdbValueBuffer<'l> {
    ptr: *const u8,
    len: usize,
    _guard: read_tx_cache::ReadTxGuard<'l>,
    _marker: PhantomData<&'l LmbdKeyValueDatabase>,
}

impl<'l> LmdbValueBuffer<'l> {
    fn from_raw_parts(ptr: *const u8, len: usize, guard: read_tx_cache::ReadTxGuard<'l>) -> Self {
        Self {
            ptr,
            len,
            _guard: guard,
            _marker: PhantomData,
        }
    }
}

impl AsRef<[u8]> for LmdbValueBuffer<'_> {
    fn as_ref(&self) -> &[u8] {
        // Safety: ptr/len points into LMDB value memory owned by the guarded read transaction.
        // The guard keeps that transaction alive for at least as long as this value buffer.
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}

pub struct LmbdKeyValueDatabase {
    // Safety: this cache must be dropped before `env`.
    read_tx_cache: read_tx_cache::ReadTxCache,
    env: Environment,
    infra_db: Database,
    data_db: Database,
    meta_db: Database,
    task_cache_db: Database,
}

impl LmbdKeyValueDatabase {
    pub fn new(path: &Path) -> Result<Self> {
        create_dir_all(path).context("Creating database directory failed")?;

        #[cfg(target_arch = "x86")]
        const MAP_SIZE: usize = usize::MAX;
        #[cfg(not(target_arch = "x86"))]
        const MAP_SIZE: usize = 40 * 1024 * 1024 * 1024;

        let env = Environment::new()
            .set_flags(
                EnvironmentFlags::WRITE_MAP
                    | EnvironmentFlags::NO_META_SYNC
                    | EnvironmentFlags::NO_TLS,
            )
            .set_max_readers((available_parallelism().map_or(16, |v| v.get()) * 8) as u32)
            .set_max_dbs(4)
            .set_map_size(MAP_SIZE)
            .open(path)?;
        let infra_db = env.create_db(Some("infra"), DatabaseFlags::INTEGER_KEY)?;
        let data_db = env.create_db(Some("data"), DatabaseFlags::INTEGER_KEY)?;
        let meta_db = env.create_db(Some("meta"), DatabaseFlags::INTEGER_KEY)?;
        let task_cache_db = env.create_db(Some("task_cache"), DatabaseFlags::empty())?;
        Ok(LmbdKeyValueDatabase {
            read_tx_cache: read_tx_cache::ReadTxCache::new(),
            env,
            infra_db,
            data_db,
            meta_db,
            task_cache_db,
        })
    }

    fn db(&self, key_space: KeySpace) -> Database {
        match key_space {
            KeySpace::Infra => self.infra_db,
            KeySpace::TaskMeta => self.meta_db,
            KeySpace::TaskData => self.data_db,
            KeySpace::TaskCache => self.task_cache_db,
        }
    }

    fn get_read_tx(&self) -> read_tx_cache::ReadTxGuard<'_> {
        self.read_tx_cache.get_read_tx(&self.env)
    }

    fn get_from_tx<'tx>(
        tx: &'tx impl Transaction,
        db: Database,
        key: &[u8],
    ) -> Result<Option<&'tx [u8]>> {
        match extended_key::get(tx, db, key) {
            Ok(result) => Ok(Some(result)),
            Err(err) if err == lmdb::Error::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }
}

impl KeyValueDatabase for LmbdKeyValueDatabase {
    type ValueBuffer<'l> = LmdbValueBuffer<'l>;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>> {
        let tx = self.get_read_tx();
        let Some(value) = Self::get_from_tx(&**tx, self.db(key_space), key)? else {
            return Ok(None);
        };
        Ok(Some(LmdbValueBuffer::from_raw_parts(
            value.as_ptr(),
            value.len(),
            tx,
        )))
    }

    fn batch_get<'l>(
        &'l self,
        key_space: KeySpace,
        keys: &[&[u8]],
    ) -> Result<Vec<Option<Self::ValueBuffer<'l>>>> {
        let tx = self.get_read_tx();
        let db = self.db(key_space);
        keys.iter()
            .map(|key| {
                let value = Self::get_from_tx(&**tx, db, key)?;
                Ok(value.map(|value| {
                    LmdbValueBuffer::from_raw_parts(value.as_ptr(), value.len(), tx.clone())
                }))
            })
            .collect()
    }

    type SerialWriteBatch<'l>
        = LmbdWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(WriteBatch::serial(LmbdWriteBatch {
            tx: self.env.begin_rw_txn()?,
            this: self,
        }))
    }
}

pub struct LmbdWriteBatch<'l> {
    tx: RwTransaction<'l>,
    this: &'l LmbdKeyValueDatabase,
}

impl<'a> BaseWriteBatch<'a> for LmbdWriteBatch<'a> {
    type ValueBuffer<'l>
        = &'l [u8]
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        LmbdKeyValueDatabase::get_from_tx(&self.tx, self.this.db(key_space), key)
    }

    fn commit(self) -> Result<()> {
        self.tx.commit()?;
        // Swap generation after commit so new reads don't reuse old read transactions.
        self.this.read_tx_cache.swap_generation();
        Ok(())
    }
}

impl<'a> SerialWriteBatch<'a> for LmbdWriteBatch<'a> {
    fn put(
        &mut self,
        key_space: KeySpace,
        key: WriteBuffer<'_>,
        value: WriteBuffer<'_>,
    ) -> Result<()> {
        extended_key::put(
            &mut self.tx,
            self.this.db(key_space),
            &key,
            &value,
            WriteFlags::empty(),
        )?;
        Ok(())
    }

    fn delete(&mut self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        extended_key::delete(
            &mut self.tx,
            self.this.db(key_space),
            &key,
            WriteFlags::empty(),
        )?;
        Ok(())
    }

    fn flush(&mut self, _key_space: KeySpace) -> Result<()> {
        // this is an unimplemented optimization, this LMDB implementation is only used in testing
        Ok(())
    }
}
