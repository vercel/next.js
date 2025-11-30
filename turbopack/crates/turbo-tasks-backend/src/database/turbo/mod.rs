use std::{
    cmp::max,
    path::PathBuf,
    sync::Arc,
    thread::available_parallelism,
    time::{Duration, Instant},
};

use anyhow::{Ok, Result};
use parking_lot::Mutex;
use turbo_persistence::{
    ArcSlice, CompactConfig, KeyBase, StoreKey, TurboPersistence, ValueBuffer,
};
use turbo_tasks::{JoinHandle, message_queue::TimingEvent, spawn, turbo_tasks};

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    turbo::parallel_scheduler::TurboTasksParallelScheduler,
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, WriteBatch, WriteBuffer},
};

mod parallel_scheduler;

const MB: u64 = 1024 * 1024;
const COMPACT_CONFIG: CompactConfig = CompactConfig {
    min_merge_count: 3,
    optimal_merge_count: 8,
    max_merge_count: 64,
    max_merge_bytes: 512 * MB,
    min_merge_duplication_bytes: 50 * MB,
    optimal_merge_duplication_bytes: 100 * MB,
    max_merge_segment_count: 16,
};

pub struct TurboKeyValueDatabase {
    db: Arc<TurboPersistence<TurboTasksParallelScheduler>>,
    compact_join_handle: Mutex<Option<JoinHandle<Result<()>>>>,
    is_ci: bool,
    is_short_session: bool,
}

impl TurboKeyValueDatabase {
    pub fn new(versioned_path: PathBuf, is_ci: bool, is_short_session: bool) -> Result<Self> {
        let db = Arc::new(TurboPersistence::open(versioned_path)?);
        Ok(Self {
            db: db.clone(),
            compact_join_handle: Mutex::new(None),
            is_ci,
            is_short_session,
        })
    }
}

impl KeyValueDatabase for TurboKeyValueDatabase {
    type ReadTransaction<'l>
        = ()
    where
        Self: 'l;

    fn is_empty(&self) -> bool {
        self.db.is_empty()
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        Ok(())
    }

    type ValueBuffer<'l>
        = ArcSlice<u8>
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        _transaction: &'l Self::ReadTransaction<'db>,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        self.db.get(key_space as usize, &key)
    }

    type ConcurrentWriteBatch<'l>
        = TurboWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        // Wait for the compaction to finish
        if let Some(join_handle) = self.compact_join_handle.lock().take() {
            join_handle.join()?;
        }
        // Start a new write batch
        Ok(WriteBatch::concurrent(TurboWriteBatch {
            batch: self.db.write_batch()?,
            db: &self.db,
            compact_join_handle: (!self.is_short_session && !self.db.is_empty())
                .then_some(&self.compact_join_handle),
        }))
    }

    fn prevent_writes(&self) {}

    fn shutdown(&self) -> Result<()> {
        // Wait for the compaction to finish
        if let Some(join_handle) = self.compact_join_handle.lock().take() {
            join_handle.join()?;
        }
        // Compact the database on shutdown
        if self.is_ci {
            // Fully compact in CI to reduce cache size
            do_compact(
                &self.db,
                "Finished filesystem cache database compaction",
                usize::MAX,
            )?;
        } else {
            // Compact with a reasonable limit in non-CI environments
            do_compact(
                &self.db,
                "Finished filesystem cache database compaction",
                available_parallelism().map_or(4, |c| max(4, c.get())),
            )?;
        }
        // Shutdown the database
        self.db.shutdown()
    }
}

fn do_compact(
    db: &TurboPersistence<TurboTasksParallelScheduler>,
    message: &'static str,
    max_merge_segment_count: usize,
) -> Result<()> {
    let start = Instant::now();
    // Compact the database with the given max merge segment count
    let ran = db.compact(&CompactConfig {
        max_merge_segment_count,
        ..COMPACT_CONFIG
    })?;
    if ran {
        let elapsed = start.elapsed();
        // avoid spamming the event queue with information about fast operations
        if elapsed > Duration::from_secs(10) {
            turbo_tasks()
                .send_compilation_event(Arc::new(TimingEvent::new(message.to_string(), elapsed)));
        }
    }
    Ok(())
}

pub struct TurboWriteBatch<'a> {
    batch: turbo_persistence::WriteBatch<WriteBuffer<'static>, TurboTasksParallelScheduler, 5>,
    db: &'a Arc<TurboPersistence<TurboTasksParallelScheduler>>,
    compact_join_handle: Option<&'a Mutex<Option<JoinHandle<Result<()>>>>>,
}

impl<'a> BaseWriteBatch<'a> for TurboWriteBatch<'a> {
    type ValueBuffer<'l>
        = ArcSlice<u8>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.db.get(key_space as usize, &key)
    }

    fn commit(self) -> Result<()> {
        // Commit the write batch
        self.db.commit_write_batch(self.batch)?;

        if let Some(compact_join_handle) = self.compact_join_handle {
            // Start a new compaction in the background
            let db = self.db.clone();
            let handle = spawn(async move {
                do_compact(
                    &db,
                    "Finished filesystem cache database compaction",
                    available_parallelism().map_or(4, |c| max(4, c.get() / 2)),
                )
            });
            compact_join_handle.lock().replace(handle);
        }

        Ok(())
    }
}

impl<'a> ConcurrentWriteBatch<'a> for TurboWriteBatch<'a> {
    fn put(&self, key_space: KeySpace, key: WriteBuffer<'_>, value: WriteBuffer<'_>) -> Result<()> {
        self.batch
            .put(key_space as u32, key.into_static(), value.into())
    }

    fn delete(&self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        self.batch.delete(key_space as u32, key.into_static())
    }

    unsafe fn flush(&self, key_space: KeySpace) -> Result<()> {
        unsafe { self.batch.flush(key_space as u32) }
    }
}

impl KeyBase for WriteBuffer<'_> {
    fn len(&self) -> usize {
        (**self).len()
    }

    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        for item in &**self {
            state.write_u8(*item);
        }
    }
}

impl StoreKey for WriteBuffer<'_> {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(self);
    }
}

impl PartialEq for WriteBuffer<'_> {
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl Eq for WriteBuffer<'_> {}

impl Ord for WriteBuffer<'_> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (**self).cmp(&**other)
    }
}

impl PartialOrd for WriteBuffer<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<'l> From<WriteBuffer<'l>> for ValueBuffer<'l> {
    fn from(val: WriteBuffer<'l>) -> Self {
        match val {
            WriteBuffer::Borrowed(b) => ValueBuffer::Borrowed(b),
            WriteBuffer::Vec(v) => ValueBuffer::Vec(v),
            WriteBuffer::SmallVec(sv) => ValueBuffer::SmallVec(sv),
        }
    }
}
