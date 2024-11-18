use std::{
    cell::UnsafeCell,
    hash::{BuildHasher, BuildHasherDefault},
    iter::once,
    mem::replace,
    path::Path,
    sync::{
        mpsc::{sync_channel, SyncSender},
        Arc,
    },
    thread::{available_parallelism, scope, spawn, JoinHandle},
    time::Instant,
};

use anyhow::{Context, Result};
use rocksdb::{ColumnFamily, Env, SliceTransform, WriteOptions, DB};
use rustc_hash::FxHasher;
use thread_local::ThreadLocal;

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch},
};

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
/// Use atomic flush instead of WAL
const USE_ATOMIC_FLUSH: bool = false;

/// Use a concurrent write batch and a separate thread to create the write batch
const USE_WRITE_BATCH_THREAD: bool = true;

const SHARD_BITS: usize = 4;
const SHARDS: usize = 1 << SHARD_BITS;

make_names!(TASK_DATA, "task-data-");
make_names!(TASK_META, "task-meta-");
make_names!(FORWARD_TASK_CACHE, "forward-task-cache-");
make_names!(REVERSE_TASK_CACHE, "reverse-task-cache-");

pub struct RocksDbKeyValueDatabase {
    db: Arc<DB>,
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
        Ok(Self { db: Arc::new(db) })
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
            .cf_handle(cf_name(key_space, shard))
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

    type SerialWriteBatch<'l>
        = SerialRocksDbWriteBatch<'l>
    where
        Self: 'l;

    type ConcurrentWriteBatch<'l>
        = ConcurrentRocksDbWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(if USE_WRITE_BATCH_THREAD {
            WriteBatch::concurrent(ConcurrentRocksDbWriteBatch::new(self))
        } else {
            WriteBatch::serial(SerialRocksDbWriteBatch::new(self))
        })
    }
}

struct JobEntry {
    cf_name: &'static str,
    key: Vec<u8>,
    value: Option<Vec<u8>>,
}

pub struct ConcurrentRocksDbWriteBatch<'a> {
    sender: SyncSender<Vec<JobEntry>>,
    thread_local: ThreadLocal<UnsafeCell<Vec<JobEntry>>>,
    thread: JoinHandle<Result<rocksdb::WriteBatch>>,
    this: &'a RocksDbKeyValueDatabase,
}

impl<'a> ConcurrentRocksDbWriteBatch<'a> {
    fn new(this: &'a RocksDbKeyValueDatabase) -> Self {
        let (sender, receiver) = sync_channel(1024);
        let db = this.db.clone();
        Self {
            sender,
            thread_local: ThreadLocal::new(),
            thread: spawn(move || {
                let mut batch = rocksdb::WriteBatch::default();
                for JobEntry {
                    cf_name,
                    key,
                    value,
                } in receiver.iter().flatten()
                {
                    let cf = db
                        .cf_handle(cf_name)
                        .context("Failed to get column family")?;
                    if let Some(value) = value {
                        batch.put_cf(cf, key, value);
                    } else {
                        batch.delete_cf(cf, key);
                    }
                }
                anyhow::Ok(batch)
            }),
            this,
        }
    }
}

impl<'a> BaseWriteBatch<'a> for ConcurrentRocksDbWriteBatch<'a> {
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
        println!("commit started");
        let start = Instant::now();
        for vec in self.thread_local.into_iter() {
            let vec = vec.into_inner();
            if !vec.is_empty() {
                self.sender.send(vec)?;
            }
        }
        drop(self.sender);
        let batch = self.thread.join().unwrap()?;
        println!("Finishing batch took {:?}", start.elapsed());
        write_and_flush(&self.this.db, batch)
    }
}

impl ConcurrentRocksDbWriteBatch<'_> {
    fn push_job(&self, job: JobEntry) -> Result<()> {
        let cell = self
            .thread_local
            .get_or(|| UnsafeCell::new(Vec::with_capacity(1024)));
        // SAFETY: We are the only thread that has access to this thread-local
        let vec = unsafe { &mut *cell.get() };
        vec.push(job);
        if vec.len() == vec.capacity() {
            self.sender.send(replace(vec, Vec::with_capacity(1024)))?;
        }
        Ok(())
    }
}

impl<'a> ConcurrentWriteBatch<'a> for ConcurrentRocksDbWriteBatch<'a> {
    fn put(
        &self,
        key_space: KeySpace,
        key: std::borrow::Cow<[u8]>,
        value: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        let cf_name = cf_name(key_space, key_to_shard(&key));
        self.push_job(JobEntry {
            cf_name,
            key: key.into_owned(),
            value: Some(value.into_owned()),
        })?;
        Ok(())
    }

    fn delete(&self, key_space: KeySpace, key: std::borrow::Cow<[u8]>) -> Result<()> {
        let cf_name = cf_name(key_space, key_to_shard(&key));
        self.push_job(JobEntry {
            cf_name,
            key: key.into_owned(),
            value: None,
        })?;
        Ok(())
    }
}

pub struct SerialRocksDbWriteBatch<'a> {
    batch: rocksdb::WriteBatch,
    this: &'a RocksDbKeyValueDatabase,
}

impl<'a> SerialRocksDbWriteBatch<'a> {
    fn new(this: &'a RocksDbKeyValueDatabase) -> Self {
        Self {
            batch: rocksdb::WriteBatch::default(),
            this,
        }
    }
}

impl<'a> BaseWriteBatch<'a> for SerialRocksDbWriteBatch<'a> {
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
        println!("commit started");
        let batch = self.batch;
        write_and_flush(&self.this.db, batch)
    }
}

impl<'a> SerialWriteBatch<'a> for SerialRocksDbWriteBatch<'a> {
    fn put(
        &mut self,
        key_space: KeySpace,
        key: std::borrow::Cow<[u8]>,
        value: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        let cf = self.this.cf_handle(key_space, &key)?;
        self.batch.put_cf(cf, key, value);
        Ok(())
    }

    fn delete(&mut self, key_space: KeySpace, key: std::borrow::Cow<[u8]>) -> Result<()> {
        let cf = self.this.cf_handle(key_space, &key)?;
        self.batch.delete_cf(cf, key);
        Ok(())
    }
}

fn write_and_flush(db: &DB, batch: rocksdb::WriteBatch) -> Result<()> {
    let start = Instant::now();
    let mut write_options = WriteOptions::default();
    if USE_ATOMIC_FLUSH {
        write_options.disable_wal(true);
    }
    db.write_opt(batch, &write_options)?;
    println!("Write took {:?}", start.elapsed());
    let start = Instant::now();
    if !USE_ATOMIC_FLUSH {
        scope(|s| {
            let threads = RocksDbKeyValueDatabase::all_cf_names()
                .map(|name| {
                    s.spawn(move || {
                        let cf = db.cf_handle(name).context("Failed to get column family")?;
                        db.flush_cf(cf)?;
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
    db.wait_for_compact(&wait_for_compact_options)?;
    println!("Flush took {:?}", start.elapsed());
    Ok(())
}

fn key_to_shard(key: &[u8]) -> usize {
    if key.len() <= 4 {
        // It's a TaskId in little-endian, we can take the first byte
        (key[0] & (SHARDS as u8 - 1)) as usize
    } else {
        let hash = BuildHasherDefault::<FxHasher>::default().hash_one(key);
        (hash as u8 & (SHARDS as u8 - 1)) as usize
    }
}

fn cf_name(key_space: KeySpace, shard: usize) -> &'static str {
    match key_space {
        KeySpace::Infra => "default",
        KeySpace::TaskMeta => TASK_META[shard],
        KeySpace::TaskData => TASK_DATA[shard],
        KeySpace::ForwardTaskCache => FORWARD_TASK_CACHE[shard],
        KeySpace::ReverseTaskCache => REVERSE_TASK_CACHE[shard],
    }
}
