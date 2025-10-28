use std::{fs::create_dir_all, path::Path, thread::available_parallelism};

use anyhow::{Context, Result};
use lmdb::{
    Database, DatabaseFlags, Environment, EnvironmentFlags, RoTransaction, RwTransaction,
    Transaction, WriteFlags,
};

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, SerialWriteBatch, WriteBatch, WriteBuffer},
};

mod extended_key;

pub struct LmbdKeyValueDatabase {
    env: Environment,
    infra_db: Database,
    data_db: Database,
    meta_db: Database,
    forward_task_cache_db: Database,
    reverse_task_cache_db: Database,
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
            .set_max_dbs(5)
            .set_map_size(MAP_SIZE)
            .open(path)?;
        let infra_db = env.create_db(Some("infra"), DatabaseFlags::INTEGER_KEY)?;
        let data_db = env.create_db(Some("data"), DatabaseFlags::INTEGER_KEY)?;
        let meta_db = env.create_db(Some("meta"), DatabaseFlags::INTEGER_KEY)?;
        let forward_task_cache_db =
            env.create_db(Some("forward_task_cache"), DatabaseFlags::empty())?;
        let reverse_task_cache_db =
            env.create_db(Some("reverse_task_cache"), DatabaseFlags::INTEGER_KEY)?;
        Ok(LmbdKeyValueDatabase {
            env,
            infra_db,
            data_db,
            meta_db,
            forward_task_cache_db,
            reverse_task_cache_db,
        })
    }

    fn db(&self, key_space: KeySpace) -> Database {
        match key_space {
            KeySpace::Infra => self.infra_db,
            KeySpace::TaskMeta => self.meta_db,
            KeySpace::TaskData => self.data_db,
            KeySpace::ForwardTaskCache => self.forward_task_cache_db,
            KeySpace::ReverseTaskCache => self.reverse_task_cache_db,
        }
    }
}

impl KeyValueDatabase for LmbdKeyValueDatabase {
    type ReadTransaction<'l>
        = RoTransaction<'l>
    where
        Self: 'l;

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        Ok(self.env.begin_ro_txn()?)
    }

    type ValueBuffer<'l> = &'l [u8];

    fn get<'l, 'db: 'l>(
        &'l self,
        transaction: &'l Self::ReadTransaction<'db>,
        key_space: super::key_value_database::KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        let db = match key_space {
            KeySpace::Infra => self.infra_db,
            KeySpace::TaskMeta => self.meta_db,
            KeySpace::TaskData => self.data_db,
            KeySpace::ForwardTaskCache => self.forward_task_cache_db,
            KeySpace::ReverseTaskCache => self.reverse_task_cache_db,
        };

        let value = match extended_key::get(transaction, db, key) {
            Ok(result) => result,
            Err(err) => {
                if err == lmdb::Error::NotFound {
                    return Ok(None);
                } else {
                    return Err(err.into());
                }
            }
        };
        Ok(Some(value))
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
        match extended_key::get(&self.tx, self.this.db(key_space), key) {
            Ok(value) => Ok(Some(value)),
            Err(err) => {
                if err == lmdb::Error::NotFound {
                    Ok(None)
                } else {
                    Err(err.into())
                }
            }
        }
    }

    fn commit(self) -> Result<()> {
        self.tx.commit()?;
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
