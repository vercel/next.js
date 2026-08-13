use std::{
    cmp::max,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant, SystemTime},
};

use anyhow::{Ok, Result};
use smallvec::SmallVec;
use turbo_persistence::{
    ArcBytes, CommitStats, CompactConfig, DbConfig, KeyBase, StoreKey, TurboPersistence,
    ValueBuffer,
};
use turbo_tasks::{
    message_queue::{TimingEvent, TraceEvent},
    parallel::available_parallelism,
    turbo_tasks,
};

use crate::database::{key_value_database::KeySpace, write_batch::WriteBuffer};

mod parallel_scheduler;
pub(crate) use parallel_scheduler::TurboTasksParallelScheduler;

/// Number of key families, see [`KeySpace`] enum for their numbers.
pub const FAMILIES: usize = 4;

const COMPACTION_MESSAGE: &str = "Finished filesystem cache database compaction";

const MB: u64 = 1024 * 1024;

/// Returns the database configuration for the Turbopack persistent cache, mapping each
/// [`KeySpace`] to its persistence family config.
pub fn db_config() -> DbConfig<FAMILIES> {
    DbConfig {
        family_configs: std::array::from_fn(|i| KeySpace::from_index(i).family_config()),
    }
}

pub const COMPACT_CONFIG: CompactConfig = CompactConfig {
    min_merge_count: 3,
    optimal_merge_count: 8,
    max_merge_count: 64,
    max_merge_bytes: 512 * MB,
    min_merge_duplication_bytes: 50 * MB,
    optimal_merge_duplication_bytes: 100 * MB,
    max_merge_segment_count: 16,
};

pub struct TurboKeyValueDatabase {
    db: TurboPersistence<TurboTasksParallelScheduler, FAMILIES>,
    is_ci: bool,
    is_short_session: bool,
    is_fresh: bool,
    skip_compaction: bool,
}

impl TurboKeyValueDatabase {
    pub fn new(
        versioned_path: PathBuf,
        is_ci: bool,
        is_short_session: bool,
        skip_compaction: bool,
    ) -> Result<Self> {
        assert!(
            !skip_compaction || is_short_session,
            "skip_compaction=true requires is_short_session=true"
        );
        let db = TurboPersistence::open_with_config(versioned_path, db_config())?;
        let is_fresh = db.is_empty();
        Ok(Self {
            db,
            is_ci,
            is_short_session,
            is_fresh,
            skip_compaction,
        })
    }

    /// Construct an empty, read-only database that never touches the filesystem. Used for the
    /// in-process "noop" backing storage. Reads return None; writes would bail (but no callers
    /// write — see `BackendOptions::storage_mode = None`).
    pub fn empty_in_memory() -> Self {
        Self {
            db: TurboPersistence::empty_in_memory_with_config(db_config()),
            is_ci: false,
            is_short_session: true,
            is_fresh: true,
            skip_compaction: true,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.db.is_empty()
    }

    pub fn get(&self, key_space: KeySpace, key: &[u8]) -> Result<Option<ArcBytes>> {
        self.db.get(key_space as usize, &key)
    }

    pub fn batch_get(&self, key_space: KeySpace, keys: &[&[u8]]) -> Result<Vec<Option<ArcBytes>>> {
        self.db.batch_get(key_space as usize, keys)
    }

    /// Looks up a key and returns all matching values.
    ///
    /// Useful for keyspaces where keys are hashes and collisions are possible (e.g., TaskCache).
    pub fn get_multiple(&self, key_space: KeySpace, key: &[u8]) -> Result<SmallVec<[ArcBytes; 1]>> {
        self.db.get_multiple(key_space as usize, &key)
    }

    pub fn write_batch(&self) -> Result<TurboWriteBatch<'_>> {
        Ok(TurboWriteBatch {
            batch: self.db.write_batch()?,
            db: &self.db,
        })
    }

    /// Called when the database has been invalidated via
    /// [`crate::kv_backing_storage::TurboBackingStorage::invalidate`].
    ///
    /// This typically means that we'll restart the process or `turbo-tasks` soon with a fresh
    /// database. If this happens, there's no point in writing anything else to disk, or flushing
    /// during [`TurboKeyValueDatabase::shutdown`].
    pub fn prevent_writes(&self) {}

    /// Triggers compaction of the database.
    ///
    /// Returns `Ok(Some(stats))` with the bytes written/deleted if compaction actually merged
    /// files, `Ok(None)` if there was nothing to compact.
    pub fn compact(&self) -> Result<Option<CommitStats>> {
        if self.is_short_session || self.db.is_empty() {
            return Ok(None);
        }
        do_compact(
            &self.db,
            COMPACTION_MESSAGE,
            available_parallelism().map_or(4, |c| max(4, c.get() / 2)),
        )
    }

    /// Returns true if the database is in an unrecoverable error state where a previous write or
    /// compaction failed and the rollback also failed, permanently disabling further writes.
    pub fn has_unrecoverable_write_error(&self) -> bool {
        self.db.has_unrecoverable_write_error()
    }

    pub fn shutdown(&self) -> Result<()> {
        // Compact the database on shutdown
        // (Avoid compacting a fresh database since we don't have any usage info yet)
        if !self.is_fresh && !self.skip_compaction {
            if self.is_ci {
                // Fully compact in CI to reduce cache size
                do_compact(&self.db, COMPACTION_MESSAGE, usize::MAX)?;
            } else {
                // Compact with a reasonable limit in non-CI environments
                do_compact(
                    &self.db,
                    COMPACTION_MESSAGE,
                    available_parallelism().map_or(4, |c| max(4, c.get())),
                )?;
            }
        }
        // Shutdown the database
        self.db.shutdown()
    }
}

fn do_compact(
    db: &TurboPersistence<TurboTasksParallelScheduler, FAMILIES>,
    message: &'static str,
    max_merge_segment_count: usize,
) -> Result<Option<CommitStats>> {
    let start = Instant::now();
    // SystemTime for wall-clock timestamps in trace events (Instant has no
    // defined epoch so it can't be used for cross-process trace correlation).
    let wall_start = SystemTime::now();
    let stats = db.compact(&CompactConfig {
        max_merge_segment_count,
        ..COMPACT_CONFIG
    })?;
    if let Some(stats) = stats {
        let elapsed = start.elapsed();
        // avoid spamming the event queue with information about fast operations
        if elapsed > Duration::from_secs(10) {
            turbo_tasks()
                .send_compilation_event(Arc::new(TimingEvent::new(message.to_string(), elapsed)));
        }
        let wall_start_ms = wall_start
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64()
            * 1000.0;
        let wall_end_ms = wall_start_ms + elapsed.as_secs_f64() * 1000.0;
        turbo_tasks().send_compilation_event(Arc::new(TraceEvent::new(
            "turbopack-compaction",
            wall_start_ms,
            wall_end_ms,
            serde_json::json!([
                ["bytes_written", stats.bytes_written],
                ["bytes_deleted", stats.bytes_deleted],
            ]),
        )));
    }
    Ok(stats)
}

pub struct TurboWriteBatch<'a> {
    batch: turbo_persistence::WriteBatch<
        'a,
        WriteBuffer<'static>,
        TurboTasksParallelScheduler,
        FAMILIES,
    >,
    db: &'a TurboPersistence<TurboTasksParallelScheduler, FAMILIES>,
}

impl<'a> TurboWriteBatch<'a> {
    pub fn get(&self, key_space: KeySpace, key: &[u8]) -> Result<Option<ArcBytes>> {
        self.db.get(key_space as usize, &key)
    }

    pub fn commit(self) -> Result<CommitStats> {
        self.db.commit_write_batch(self.batch)
    }

    pub fn put(
        &self,
        key_space: KeySpace,
        key: WriteBuffer<'_>,
        value: WriteBuffer<'_>,
    ) -> Result<()> {
        self.batch
            .put(key_space as u32, key.into_static(), value.into())
    }

    /// Flushes a key space of the write batch, reducing the amount of buffered memory used.
    /// Does not commit any data persistently.
    ///
    /// Safety: Caller must ensure that no concurrent put operation is happening on the flushed
    /// key space.
    pub unsafe fn flush(&self, key_space: KeySpace) -> Result<()> {
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
