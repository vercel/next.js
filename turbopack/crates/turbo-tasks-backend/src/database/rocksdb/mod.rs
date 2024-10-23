use std::{
    cell::UnsafeCell,
    hash::{BuildHasher, BuildHasherDefault},
    iter::once,
    path::Path,
    thread::{available_parallelism, scope},
    time::Instant,
};

use anyhow::{Context, Result};
use rocksdb::{ColumnFamily, Env, SliceTransform, WriteOptions, DB};
use rustc_hash::FxHasher;
use thread_local::ThreadLocal;

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, WriteBatch},
};

#[derive(Default)]
struct RdbWriteBatch(rocksdb::WriteBatch);

unsafe impl Send for RdbWriteBatch {}
unsafe impl Sync for RdbWriteBatch {}

macro_rules! make_names {
    ($name: ident, $prefix: literal) => {
        make_names!($name, $prefix, 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15);
    };
    ($name: ident, $prefix: literal, $($i: expr)*) => {
        static $name: [&str; SHARDS] = [
            $(concat!($prefix, $i),)*
        ];
    };
}

// Atomic flush doesn't support parallel flushing of the column families so we can't use it
const USE_ATOMIC_FLUSH: bool = false;

const SHARD_BITS: usize = 4;
const SHARDS: usize = 1 << SHARD_BITS;

make_names!(TASK_DATA, "task-data-");
make_names!(TASK_META, "task-meta-");
make_names!(FORWARD_TASK_CACHE, "forward-task-cache-");
make_names!(REVERSE_TASK_CACHE, "reverse-task-cache-");

pub struct RocksDbKeyValueDatabase {
    db: DB,
}

impl RocksDbKeyValueDatabase {
    pub fn new(path: &Path) -> Result<Self> {
        let parallelism = available_parallelism().map_or(4, |p| p.get() as i32);
        let mut env = Env::new()?;
        env.set_background_threads(parallelism);
        env.set_high_priority_background_threads(parallelism);
        env.set_bottom_priority_background_threads(parallelism);
        env.set_low_priority_background_threads(parallelism);
        let mut options = rocksdb::Options::default();
        options.set_env(&env);
        options.create_if_missing(true);
        options.create_missing_column_families(true);
        if USE_ATOMIC_FLUSH {
            options.set_atomic_flush(true);
        }
        options.set_allow_concurrent_memtable_write(false);
        options.set_allow_mmap_reads(true);
        options.set_allow_mmap_writes(true);
        #[allow(deprecated)]
        options.set_max_background_flushes(parallelism);
        #[allow(deprecated)]
        options.set_max_background_compactions(parallelism);
        options.set_enable_blob_files(true);
        options.set_enable_blob_gc(true);
        options.set_min_blob_size(1024 * 1024);
        let mut cf_options = rocksdb::Options::default();
        cf_options.set_compaction_style(rocksdb::DBCompactionStyle::Universal);
        cf_options.set_level_compaction_dynamic_level_bytes(false);
        cf_options.set_allow_concurrent_memtable_write(false);
        cf_options.set_prefix_extractor(SliceTransform::create_noop());
        cf_options.set_memtable_factory(rocksdb::MemtableFactory::Vector);
        cf_options.set_compression_type(rocksdb::DBCompressionType::Lz4);
        cf_options.set_compression_options(-14, 32767, 0, 1024);
        cf_options.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
        cf_options.set_bottommost_zstd_max_train_bytes(1024, true);
        cf_options.optimize_for_point_lookup(8);
        cf_options.set_min_blob_size(1024 * 1024);
        cf_options.set_enable_blob_files(true);
        cf_options.set_blob_compression_type(rocksdb::DBCompressionType::Zstd);

        let cfs = Self::all_cf_names()
            .map(|name| (name, cf_options.clone()))
            .collect::<Vec<_>>();
        let db = DB::open_cf_with_opts(&options, path, cfs)?;
        Ok(Self { db })
    }

    fn all_cf_names() -> impl Iterator<Item = &'static str> {
        once("default")
            .chain(TASK_DATA.iter().copied())
            .chain(TASK_META.iter().copied())
            .chain(FORWARD_TASK_CACHE.iter().copied())
            .chain(REVERSE_TASK_CACHE.iter().copied())
    }

    fn cf_handle(&self, key_space: KeySpace, key: &[u8]) -> Result<&ColumnFamily> {
        let shard = if key.len() <= 4 {
            // It's a TaskId in little-endian, we can take the first byte
            (key[0] & (SHARDS as u8 - 1)) as usize
        } else {
            let hash = BuildHasherDefault::<FxHasher>::default().hash_one(key);
            (hash as u8 & (SHARDS as u8 - 1)) as usize
        };
        self.db
            .cf_handle(match key_space {
                KeySpace::Infra => "default",
                KeySpace::TaskMeta => TASK_META[shard],
                KeySpace::TaskData => TASK_DATA[shard],
                KeySpace::ForwardTaskCache => FORWARD_TASK_CACHE[shard],
                KeySpace::ReverseTaskCache => REVERSE_TASK_CACHE[shard],
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
        let cf = self.cf_handle(key_space, key)?;
        Ok(self.db.get_cf(cf, key)?)
    }

    type ConcurrentWriteBatch<'l>
        = RocksDbWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch<'l>(
        &'l self,
    ) -> Result<WriteBatch<'l, Self::SerialWriteBatch<'l>, Self::ConcurrentWriteBatch<'l>>> {
        Ok(WriteBatch::concurrent(RocksDbWriteBatch {
            batches: ThreadLocal::new(),
            this: self,
        }))
    }
}

pub struct RocksDbWriteBatch<'a> {
    batches: ThreadLocal<UnsafeCell<RdbWriteBatch>>,
    this: &'a RocksDbKeyValueDatabase,
}

impl<'a> BaseWriteBatch<'a> for RocksDbWriteBatch<'a> {
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

    fn commit(self) -> Result<()> {
        let start = Instant::now();
        let mut write_options = WriteOptions::default();
        if USE_ATOMIC_FLUSH {
            write_options.disable_wal(true);
        }
        let batches = self
            .batches
            .into_iter()
            .map(|batch| batch.into_inner().0)
            .collect::<Vec<_>>();
        if batches.is_empty() {
            return Ok(());
        }
        // For consistency we need to merge all write batches into a single large one
        // But it has an header of (sequence number: u64, count: u32) for each batch which need to
        // be merged
        let data = batches.iter().map(|batch| batch.data()).collect::<Vec<_>>();
        let size = data.iter().map(|data| data.len() - 12).sum::<usize>();
        let count = data
            .iter()
            .map(|data| u32::from_ne_bytes(TryInto::try_into(&data[8..12]).unwrap()))
            .sum::<u32>();
        let mut new_data = Vec::with_capacity(size + 12);
        new_data.extend_from_slice(&data.first().unwrap()[0..8]);
        new_data.extend_from_slice(&count.to_ne_bytes());
        for data in data {
            new_data.extend_from_slice(&data[12..]);
        }
        drop(batches);
        self.this
            .db
            .write_opt(rocksdb::WriteBatch::from_data(&new_data), &write_options)?;
        println!("Write took {:?}", start.elapsed());
        let start = Instant::now();
        if !USE_ATOMIC_FLUSH {
            scope(|s| {
                let threads = RocksDbKeyValueDatabase::all_cf_names()
                    .map(|name| {
                        s.spawn(move || {
                            let cf = self
                                .this
                                .db
                                .cf_handle(name)
                                .context("Failed to get column family")?;
                            self.this.db.flush_cf(cf)?;
                            anyhow::Ok(())
                        })
                    })
                    .collect::<Vec<_>>();
                for thread in threads {
                    thread.join().unwrap()?;
                }
                anyhow::Ok(())
            })?;
        }
        let mut wait_for_compact_options = rocksdb::WaitForCompactOptions::default();
        wait_for_compact_options.set_flush(USE_ATOMIC_FLUSH);
        self.this.db.wait_for_compact(&wait_for_compact_options)?;
        println!("Flush took {:?}", start.elapsed());
        Ok(())
    }
}

impl<'a> ConcurrentWriteBatch<'a> for RocksDbWriteBatch<'a> {
    fn put(
        &self,
        key_space: KeySpace,
        key: std::borrow::Cow<[u8]>,
        value: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        let cf = self.this.cf_handle(key_space, &key)?;
        self.get_write_batch().put_cf(cf, key, value);
        Ok(())
    }

    fn delete(&self, key_space: KeySpace, key: std::borrow::Cow<[u8]>) -> Result<()> {
        let cf = self.this.cf_handle(key_space, &key)?;
        self.get_write_batch().delete_cf(cf, key);
        Ok(())
    }
}

impl<'a> RocksDbWriteBatch<'a> {
    fn get_write_batch(&self) -> &mut rocksdb::WriteBatch {
        let cell = &self.batches.get_or(|| UnsafeCell::new(Default::default()));
        // Safety: We're the only thread accessing this cell (It's a thread local)
        &mut unsafe { &mut *cell.get() }.0
    }
}
