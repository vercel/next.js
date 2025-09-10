use std::{
    cell::SyncUnsafeCell,
    fs::File,
    io::Write,
    mem::{replace, take},
    path::PathBuf,
    sync::atomic::{AtomicU32, AtomicU64, Ordering},
};

use anyhow::{Context, Result};
use byteorder::{BE, WriteBytesExt};
use either::Either;
use parking_lot::Mutex;
use smallvec::SmallVec;
use thread_local::ThreadLocal;

use crate::{
    ValueBuffer,
    collector::Collector,
    collector_entry::CollectorEntry,
    compression::compress_into_buffer,
    constants::{MAX_MEDIUM_VALUE_SIZE, THREAD_LOCAL_SIZE_SHIFT},
    key::StoreKey,
    meta_file_builder::MetaFileBuilder,
    parallel_scheduler::ParallelScheduler,
    static_sorted_file_builder::{StaticSortedFileBuilderMeta, write_static_stored_file},
};

/// The thread local state of a `WriteBatch`. `FAMILIES` should fit within a `u32`.
//
// NOTE: This type *must* use `usize`, even though the real type used in storage is `u32` because
// there's no way to cast a `u32` to `usize` when declaring an array without the nightly
// `min_generic_const_args` feature.
struct ThreadLocalState<K: StoreKey + Send, const FAMILIES: usize> {
    /// The collectors for each family.
    collectors: [Option<Collector<K, THREAD_LOCAL_SIZE_SHIFT>>; FAMILIES],
    /// The list of new blob files that have been created.
    /// Tuple of (sequence number, file).
    new_blob_files: Vec<(u32, File)>,
}

const COLLECTOR_SHARDS: usize = 4;
const COLLECTOR_SHARD_SHIFT: usize =
    u64::BITS as usize - COLLECTOR_SHARDS.trailing_zeros() as usize;

/// The result of a `WriteBatch::finish` operation.
pub(crate) struct FinishResult {
    pub(crate) sequence_number: u32,
    /// Tuple of (sequence number, file).
    pub(crate) new_meta_files: Vec<(u32, File)>,
    /// Tuple of (sequence number, file).
    pub(crate) new_sst_files: Vec<(u32, File)>,
    /// Tuple of (sequence number, file).
    pub(crate) new_blob_files: Vec<(u32, File)>,
    /// Number of keys written in this batch.
    pub(crate) keys_written: u64,
}

enum GlobalCollectorState<K: StoreKey + Send> {
    /// Initial state. Single collector. Once the collector is full, we switch to sharded mode.
    Unsharded(Collector<K>),
    /// Sharded mode.
    /// We use multiple collectors, and select one based on the first bits of the key hash.
    Sharded([Collector<K>; COLLECTOR_SHARDS]),
}

/// A write batch.
pub struct WriteBatch<K: StoreKey + Send, S: ParallelScheduler, const FAMILIES: usize> {
    /// Parallel scheduler
    parallel_scheduler: S,
    /// The database path
    db_path: PathBuf,
    /// The current sequence number counter. Increased for every new SST file or blob file.
    current_sequence_number: AtomicU32,
    /// The thread local state.
    thread_locals: ThreadLocal<SyncUnsafeCell<ThreadLocalState<K, FAMILIES>>>,
    /// Collectors in use. The thread local collectors flush into these when they are full.
    collectors: [Mutex<GlobalCollectorState<K>>; FAMILIES],
    /// Meta file builders for each family.
    meta_collectors: [Mutex<Vec<(u32, StaticSortedFileBuilderMeta<'static>)>>; FAMILIES],
    /// The list of new SST files that have been created.
    /// Tuple of (sequence number, file).
    new_sst_files: Mutex<Vec<(u32, File)>>,
}

impl<K: StoreKey + Send + Sync, S: ParallelScheduler, const FAMILIES: usize>
    WriteBatch<K, S, FAMILIES>
{
    /// Creates a new write batch for a database.
    pub(crate) fn new(path: PathBuf, current: u32, parallel_scheduler: S) -> Self {
        const {
            assert!(FAMILIES <= usize_from_u32(u32::MAX));
        };
        Self {
            parallel_scheduler,
            db_path: path,
            current_sequence_number: AtomicU32::new(current),
            thread_locals: ThreadLocal::new(),
            collectors: [(); FAMILIES]
                .map(|_| Mutex::new(GlobalCollectorState::Unsharded(Collector::new()))),
            meta_collectors: [(); FAMILIES].map(|_| Mutex::new(Vec::new())),
            new_sst_files: Mutex::new(Vec::new()),
        }
    }

    /// Returns the thread local state for the current thread.
    #[allow(clippy::mut_from_ref)]
    fn thread_local_state(&self) -> &mut ThreadLocalState<K, FAMILIES> {
        let cell = self.thread_locals.get_or(|| {
            SyncUnsafeCell::new(ThreadLocalState {
                collectors: [const { None }; FAMILIES],
                new_blob_files: Vec::new(),
            })
        });
        // Safety: We know that the cell is only accessed from the current thread.
        unsafe { &mut *cell.get() }
    }

    /// Returns the collector for a family for the current thread.
    fn thread_local_collector_mut<'l>(
        &self,
        state: &'l mut ThreadLocalState<K, FAMILIES>,
        family: u32,
    ) -> Result<&'l mut Collector<K, THREAD_LOCAL_SIZE_SHIFT>> {
        debug_assert!(usize_from_u32(family) < FAMILIES);
        let collector =
            state.collectors[usize_from_u32(family)].get_or_insert_with(|| Collector::new());
        if collector.is_full() {
            self.flush_thread_local_collector(family, collector)?;
        }
        Ok(collector)
    }

    #[tracing::instrument(level = "trace", skip(self, collector))]
    fn flush_thread_local_collector(
        &self,
        family: u32,
        collector: &mut Collector<K, THREAD_LOCAL_SIZE_SHIFT>,
    ) -> Result<()> {
        let mut full_collectors = SmallVec::<[_; 2]>::new();
        {
            let mut global_collector_state = self.collectors[usize_from_u32(family)].lock();
            for entry in collector.drain() {
                match &mut *global_collector_state {
                    GlobalCollectorState::Unsharded(collector) => {
                        collector.add_entry(entry);
                        if collector.is_full() {
                            // When full, split the entries into shards.
                            let mut shards: [Collector<K>; 4] =
                                [(); COLLECTOR_SHARDS].map(|_| Collector::new());
                            for entry in collector.drain() {
                                let shard = (entry.key.hash >> COLLECTOR_SHARD_SHIFT) as usize;
                                shards[shard].add_entry(entry);
                            }
                            // There is a rare edge case where all entries are in the same shard,
                            // and the collector is full after the split.
                            for collector in shards.iter_mut() {
                                if collector.is_full() {
                                    full_collectors
                                        .push(replace(&mut *collector, Collector::new()));
                                }
                            }
                            *global_collector_state = GlobalCollectorState::Sharded(shards);
                        }
                    }
                    GlobalCollectorState::Sharded(shards) => {
                        let shard = (entry.key.hash >> COLLECTOR_SHARD_SHIFT) as usize;
                        let collector = &mut shards[shard];
                        collector.add_entry(entry);
                        if collector.is_full() {
                            full_collectors.push(replace(&mut *collector, Collector::new()));
                        }
                    }
                }
            }
        }
        for mut global_collector in full_collectors {
            // When the global collector is full, we create a new SST file.
            let sst = self.create_sst_file(family, global_collector.sorted())?;
            self.new_sst_files.lock().push(sst);
            drop(global_collector);
        }
        Ok(())
    }

    /// Puts a key-value pair into the write batch.
    pub fn put(&self, family: u32, key: K, value: ValueBuffer<'_>) -> Result<()> {
        let state = self.thread_local_state();
        let collector = self.thread_local_collector_mut(state, family)?;
        if value.len() <= MAX_MEDIUM_VALUE_SIZE {
            collector.put(key, value);
        } else {
            let (blob, file) = self.create_blob(&value)?;
            collector.put_blob(key, blob);
            state.new_blob_files.push((blob, file));
        }
        Ok(())
    }

    /// Puts a delete operation into the write batch.
    pub fn delete(&self, family: u32, key: K) -> Result<()> {
        let state = self.thread_local_state();
        let collector = self.thread_local_collector_mut(state, family)?;
        collector.delete(key);
        Ok(())
    }

    /// Flushes a family of the write batch, reducing the amount of buffered memory used.
    /// Does not commit any data persistently.
    ///
    /// # Safety
    ///
    /// Caller must ensure that no concurrent put or delete operation is happening on the flushed
    /// family.
    #[tracing::instrument(level = "trace", skip(self))]
    pub unsafe fn flush(&self, family: u32) -> Result<()> {
        // Flush the thread local collectors to the global collector.
        let mut collectors = Vec::new();
        for cell in self.thread_locals.iter() {
            let state = unsafe { &mut *cell.get() };
            if let Some(collector) = state.collectors[usize_from_u32(family)].take()
                && !collector.is_empty()
            {
                collectors.push(collector);
            }
        }

        self.parallel_scheduler
            .try_parallel_for_each_owned(collectors, |mut collector| {
                self.flush_thread_local_collector(family, &mut collector)?;
                drop(collector);
                anyhow::Ok(())
            })?;

        // Now we flush the global collector(s).
        let mut collector_state = self.collectors[usize_from_u32(family)].lock();
        match &mut *collector_state {
            GlobalCollectorState::Unsharded(collector) => {
                if !collector.is_empty() {
                    let sst = self.create_sst_file(family, collector.sorted())?;
                    collector.clear();
                    self.new_sst_files.lock().push(sst);
                }
            }
            GlobalCollectorState::Sharded(_) => {
                let GlobalCollectorState::Sharded(mut shards) = replace(
                    &mut *collector_state,
                    GlobalCollectorState::Unsharded(Collector::new()),
                ) else {
                    unreachable!();
                };
                self.parallel_scheduler
                    .try_parallel_for_each_mut(&mut shards, |collector| {
                        if !collector.is_empty() {
                            let sst = self.create_sst_file(family, collector.sorted())?;
                            collector.clear();
                            self.new_sst_files.lock().push(sst);
                            collector.drop_contents();
                        }
                        anyhow::Ok(())
                    })?;
            }
        }

        Ok(())
    }

    /// Finishes the write batch by returning the new sequence number and the new SST files. This
    /// writes all outstanding thread local data to disk.
    #[tracing::instrument(level = "trace", skip(self))]
    pub(crate) fn finish(&mut self) -> Result<FinishResult> {
        let mut new_blob_files = Vec::new();

        // First, we flush all thread local collectors to the global collectors.
        {
            let _span = tracing::trace_span!("flush thread local collectors").entered();
            let mut collectors = [const { Vec::new() }; FAMILIES];
            for cell in self.thread_locals.iter_mut() {
                let state = cell.get_mut();
                new_blob_files.append(&mut state.new_blob_files);
                for (family, thread_local_collector) in state.collectors.iter_mut().enumerate() {
                    if let Some(collector) = thread_local_collector.take()
                        && !collector.is_empty()
                    {
                        collectors[family].push(collector);
                    }
                }
            }
            let to_flush = collectors
                .into_iter()
                .enumerate()
                .flat_map(|(family, collector)| {
                    collector
                        .into_iter()
                        .map(move |collector| (family as u32, collector))
                })
                .collect::<Vec<_>>();
            self.parallel_scheduler.try_parallel_for_each_owned(
                to_flush,
                |(family, mut collector)| {
                    self.flush_thread_local_collector(family, &mut collector)?;
                    drop(collector);
                    anyhow::Ok(())
                },
            )?;
        }

        let _span = tracing::trace_span!("flush collectors").entered();

        // Now we reduce the global collectors in parallel
        let mut new_sst_files = take(self.new_sst_files.get_mut());
        let shared_new_sst_files = Mutex::new(&mut new_sst_files);

        let new_collectors =
            [(); FAMILIES].map(|_| Mutex::new(GlobalCollectorState::Unsharded(Collector::new())));
        let collectors = replace(&mut self.collectors, new_collectors);
        let collectors = collectors
            .into_iter()
            .enumerate()
            .flat_map(|(family, state)| {
                let collector = state.into_inner();
                match collector {
                    GlobalCollectorState::Unsharded(collector) => {
                        Either::Left([(family, collector)].into_iter())
                    }
                    GlobalCollectorState::Sharded(shards) => {
                        Either::Right(shards.into_iter().map(move |collector| (family, collector)))
                    }
                }
            })
            .collect::<Vec<_>>();
        self.parallel_scheduler.try_parallel_for_each_owned(
            collectors,
            |(family, mut collector)| {
                let family = family as u32;
                if !collector.is_empty() {
                    let sst = self.create_sst_file(family, collector.sorted())?;
                    collector.clear();
                    drop(collector);
                    shared_new_sst_files.lock().push(sst);
                }
                anyhow::Ok(())
            },
        )?;

        // Not we need to write the new meta files.
        let new_meta_collectors = [(); FAMILIES].map(|_| Mutex::new(Vec::new()));
        let meta_collectors = replace(&mut self.meta_collectors, new_meta_collectors);
        let keys_written = AtomicU64::new(0);
        let file_to_write = meta_collectors
            .into_iter()
            .map(|mutex| mutex.into_inner())
            .enumerate()
            .filter(|(_, sst_files)| !sst_files.is_empty())
            .collect::<Vec<_>>();
        let new_meta_files = self
            .parallel_scheduler
            .parallel_map_collect_owned::<_, _, Result<Vec<_>>>(
                file_to_write,
                |(family, sst_files)| {
                    let family = family as u32;
                    let mut entries = 0;
                    let mut builder = MetaFileBuilder::new(family);
                    for (seq, sst) in sst_files {
                        entries += sst.entries;
                        builder.add(seq, sst);
                    }
                    keys_written.fetch_add(entries, Ordering::Relaxed);
                    let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
                    let file = builder.write(&self.db_path, seq)?;
                    Ok((seq, file))
                },
            )?;

        // Finally we return the new files and sequence number.
        let seq = self.current_sequence_number.load(Ordering::SeqCst);
        Ok(FinishResult {
            sequence_number: seq,
            new_meta_files,
            new_sst_files,
            new_blob_files,
            keys_written: keys_written.into_inner(),
        })
    }

    /// Creates a new blob file with the given value.
    /// Returns a tuple of (sequence number, file).
    #[tracing::instrument(level = "trace", skip(self, value), fields(value_len = value.len()))]
    fn create_blob(&self, value: &[u8]) -> Result<(u32, File)> {
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
        let mut buffer = Vec::new();
        buffer.write_u32::<BE>(value.len() as u32)?;
        compress_into_buffer(value, None, true, &mut buffer)
            .context("Compression of value for blob file failed")?;

        let file = self.db_path.join(format!("{seq:08}.blob"));
        let mut file = File::create(&file).context("Unable to create blob file")?;
        file.write_all(&buffer)
            .context("Unable to write blob file")?;
        file.flush().context("Unable to flush blob file")?;
        Ok((seq, file))
    }

    /// Creates a new SST file with the given collector data.
    /// Returns a tuple of (sequence number, file).
    #[tracing::instrument(level = "trace", skip(self, collector_data))]
    fn create_sst_file(
        &self,
        family: u32,
        collector_data: (&[CollectorEntry<K>], usize),
    ) -> Result<(u32, File)> {
        let (entries, total_key_size) = collector_data;
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

        let path = self.db_path.join(format!("{seq:08}.sst"));
        let (meta, file) = self
            .parallel_scheduler
            .block_in_place(|| write_static_stored_file(entries, total_key_size, &path))
            .with_context(|| format!("Unable to write SST file {seq:08}.sst"))?;

        #[cfg(feature = "verify_sst_content")]
        {
            use core::panic;

            use crate::{
                collector_entry::CollectorEntryValue,
                key::hash_key,
                lookup_entry::LookupValue,
                static_sorted_file::{
                    BlockCache, SstLookupResult, StaticSortedFile, StaticSortedFileMetaData,
                },
                static_sorted_file_builder::Entry,
            };

            file.sync_all()?;
            let sst = StaticSortedFile::open(
                &self.db_path,
                StaticSortedFileMetaData {
                    sequence_number: seq,
                    key_compression_dictionary_length: meta.key_compression_dictionary_length,
                    block_count: meta.block_count,
                },
            )?;
            let cache2 = BlockCache::with(
                10,
                u64::MAX,
                Default::default(),
                Default::default(),
                Default::default(),
            );
            let cache3 = BlockCache::with(
                10,
                u64::MAX,
                Default::default(),
                Default::default(),
                Default::default(),
            );
            let mut key_buf = Vec::new();
            for entry in entries {
                entry.write_key_to(&mut key_buf);
                let result = sst
                    .lookup(hash_key(&key_buf), &key_buf, &cache2, &cache3)
                    .expect("key found");
                key_buf.clear();
                match result {
                    SstLookupResult::Found(LookupValue::Deleted) => {}
                    SstLookupResult::Found(LookupValue::Slice {
                        value: lookup_value,
                    }) => {
                        let expected_value_slice = match &entry.value {
                            CollectorEntryValue::Small { value } => &**value,
                            CollectorEntryValue::Medium { value } => &**value,
                            _ => panic!("Unexpected value"),
                        };
                        assert_eq!(*lookup_value, *expected_value_slice);
                    }
                    SstLookupResult::Found(LookupValue::Blob { sequence_number: _ }) => {}
                    SstLookupResult::NotFound => panic!("All keys must exist"),
                }
            }
        }

        self.meta_collectors[usize_from_u32(family)]
            .lock()
            .push((seq, meta));

        Ok((seq, file))
    }
}

#[inline(always)]
const fn usize_from_u32(value: u32) -> usize {
    // This should always be true, as we assume at least a 32-bit width architecture for Turbopack.
    // Since this is a const expression, we expect it to be compiled away.
    const {
        assert!(u32::BITS < usize::BITS);
    };
    value as usize
}
