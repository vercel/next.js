use std::{path::Path, thread::available_parallelism, time::Instant};

use anyhow::{Context, Result};
use rocksdb::{
    ColumnFamily, Env, FlushOptions, SliceTransform, WaitForCompactOptions,
    WriteBatch as RdbWriteBack, WriteOptions, DB,
};

use crate::database::key_value_database::{KeySpace, KeyValueDatabase, WriteBatch};

pub struct RocksDbKeyValueDatabase {
    db: DB,
}

impl RocksDbKeyValueDatabase {
    pub fn new(path: &Path) -> Result<Self> {
        let parallelism = available_parallelism().map_or(4, |p| p.get() as i32);
        let mut env = Env::new()?;
        env.set_background_threads(parallelism);
        env.set_high_priority_background_threads(parallelism);
        let mut options = rocksdb::Options::default();
        options.set_env(&env);
        options.create_if_missing(true);
        options.create_missing_column_families(true);
        options.set_atomic_flush(true);
        options.set_allow_concurrent_memtable_write(false);
        options.set_allow_mmap_reads(true);
        options.set_allow_mmap_writes(true);
        options.increase_parallelism(parallelism);
        options.set_max_background_jobs(parallelism);
        let mut cf_options = rocksdb::Options::default();
        cf_options.set_compaction_style(rocksdb::DBCompactionStyle::Universal);
        cf_options.set_allow_concurrent_memtable_write(false);
        cf_options.set_prefix_extractor(SliceTransform::create_noop());
        cf_options.set_memtable_factory(rocksdb::MemtableFactory::Vector);
        cf_options.set_compression_type(rocksdb::DBCompressionType::Lz4);
        cf_options.set_compression_options(-14, 32767, 0, 1024);
        cf_options.set_compression_options_parallel_threads(parallelism);
        cf_options.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
        cf_options.set_bottommost_zstd_max_train_bytes(1024, true);
        cf_options.optimize_for_point_lookup(8);
        let db = DB::open_cf_with_opts(
            &options,
            path,
            [
                ("default", cf_options.clone()),
                ("task-data", cf_options.clone()),
                ("task-meta", cf_options.clone()),
                ("forward-task-cache", cf_options.clone()),
                ("reverse-task-cache", cf_options.clone()),
            ],
        )?;
        Ok(Self { db })
    }

    fn cf_handle(&self, key_space: KeySpace) -> Result<&ColumnFamily> {
        self.db
            .cf_handle(match key_space {
                KeySpace::Infra => "default",
                KeySpace::TaskMeta => "task-meta",
                KeySpace::TaskData => "task-data",
                KeySpace::ForwardTaskCache => "forward-task-cache",
                KeySpace::ReverseTaskCache => "reverse-task-cache",
            })
            .context("Failed to get column family")
    }
}

impl KeyValueDatabase for RocksDbKeyValueDatabase {
    type ReadTransaction<'l>
        = ()
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        tx
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        Ok(())
    }

    type ValueBuffer<'l>
        = Vec<u8>
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        _transaction: &'l Self::ReadTransaction<'db>,
        key_space: super::key_value_database::KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        let cf = self.cf_handle(key_space)?;
        Ok(self.db.get_cf(cf, key)?)
    }

    type WriteBatch<'l>
        = RocksDbWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::WriteBatch<'_>> {
        Ok(RocksDbWriteBatch {
            batch: RdbWriteBack::default(),
            this: &self,
        })
    }
}

pub struct RocksDbWriteBatch<'a> {
    batch: RdbWriteBack,
    this: &'a RocksDbKeyValueDatabase,
}

impl<'a> WriteBatch<'a> for RocksDbWriteBatch<'a> {
    type ValueBuffer<'l>
        = Vec<u8>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.this.get(&(), key_space, key)
    }

    fn put(
        &mut self,
        key_space: KeySpace,
        key: std::borrow::Cow<[u8]>,
        value: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        let cf = self.this.cf_handle(key_space)?;
        self.batch.put_cf(cf, key, value);
        Ok(())
    }

    fn delete(&mut self, key_space: KeySpace, key: std::borrow::Cow<[u8]>) -> Result<()> {
        let cf = self.this.cf_handle(key_space)?;
        self.batch.delete_cf(cf, key);
        Ok(())
    }

    fn commit(self) -> Result<()> {
        let start = Instant::now();
        let mut write_options = WriteOptions::default();
        write_options.disable_wal(true);
        self.this.db.write_opt(self.batch, &write_options)?;
        println!("Write took {:?}", start.elapsed());
        let start = Instant::now();
        let mut wait_for_compact_options = WaitForCompactOptions::default();
        wait_for_compact_options.set_flush(true);
        self.this.db.wait_for_compact(&wait_for_compact_options)?;
        println!("Flush took {:?}", start.elapsed());
        Ok(())
    }
}
