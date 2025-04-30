use std::{
    cell::UnsafeCell,
    fs::File,
    io::Write,
    mem::{replace, take},
    path::PathBuf,
    sync::atomic::{AtomicU32, Ordering},
};

use anyhow::{Context, Result};
use byteorder::{WriteBytesExt, BE};
use lzzzz::lz4::{self, ACC_LEVEL_DEFAULT};
use parking_lot::Mutex;
use rayon::{
    iter::{Either, IndexedParallelIterator, IntoParallelIterator, ParallelIterator},
    scope,
};
use smallvec::SmallVec;
use thread_local::ThreadLocal;

use crate::{
    collector::Collector,
    collector_entry::CollectorEntry,
    constants::{MAX_MEDIUM_VALUE_SIZE, THREAD_LOCAL_SIZE_SHIFT},
    key::StoreKey,
    static_sorted_file_builder::StaticSortedFileBuilder,
    ValueBuffer,
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
    pub(crate) new_sst_files: Vec<(u32, File)>,
    /// Tuple of (sequence number, file).
    pub(crate) new_blob_files: Vec<(u32, File)>,
}

enum GlobalCollectorState<K: StoreKey + Send> {
    /// Initial state. Single collector. Once the collector is full, we switch to sharded mode.
    Unsharded(Collector<K>),
    /// Sharded mode.
    /// We use multiple collectors, and select one based on the first bits of the key hash.
    Sharded([Collector<K>; COLLECTOR_SHARDS]),
}

/// A write batch.
pub struct WriteBatch<K: StoreKey + Send, const FAMILIES: usize> {
    /// The database path
    path: PathBuf,
    /// The current sequence number counter. Increased for every new SST file or blob file.
    current_sequence_number: AtomicU32,
    /// The thread local state.
    thread_locals: ThreadLocal<UnsafeCell<ThreadLocalState<K, FAMILIES>>>,
    /// Collectors in use. The thread local collectors flush into these when they are full.
    collectors: [Mutex<GlobalCollectorState<K>>; FAMILIES],
    /// The list of new SST files that have been created.
    /// Tuple of (sequence number, file).
    new_sst_files: Mutex<Vec<(u32, File)>>,
    /// Collectors that are currently unused, but have memory preallocated.
    idle_collectors: Mutex<Vec<Collector<K>>>,
    /// Collectors that are currently unused, but have memory preallocated.
    idle_thread_local_collectors: Mutex<Vec<Collector<K, THREAD_LOCAL_SIZE_SHIFT>>>,
}

impl<K: StoreKey + Send + Sync, const FAMILIES: usize> WriteBatch<K, FAMILIES> {
    /// Creates a new write batch for a database.
    pub(crate) fn new(path: PathBuf, current: u32) -> Self {
        const {
            assert!(FAMILIES <= usize_from_u32(u32::MAX));
        };
        Self {
            path,
            current_sequence_number: AtomicU32::new(current),
            thread_locals: ThreadLocal::new(),
            collectors: [(); FAMILIES]
                .map(|_| Mutex::new(GlobalCollectorState::Unsharded(Collector::new()))),
            new_sst_files: Mutex::new(Vec::new()),
            idle_collectors: Mutex::new(Vec::new()),
            idle_thread_local_collectors: Mutex::new(Vec::new()),
        }
    }

    /// Resets the write batch to a new sequence number. This is called when the WriteBatch is
    /// reused.
    pub(crate) fn reset(&mut self, current: u32) {
        self.current_sequence_number
            .store(current, Ordering::SeqCst);
    }

    /// Returns the thread local state for the current thread.
    #[allow(clippy::mut_from_ref)]
    fn thread_local_state(&self) -> &mut ThreadLocalState<K, FAMILIES> {
        let cell = self.thread_locals.get_or(|| {
            UnsafeCell::new(ThreadLocalState {
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
        let collector = state.collectors[usize_from_u32(family)].get_or_insert_with(|| {
            self.idle_thread_local_collectors
                .lock()
                .pop()
                .unwrap_or_else(|| Collector::new())
        });
        if collector.is_full() {
            self.flush_thread_local_collector(family, collector)?;
        }
        Ok(collector)
    }

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
                                        .push(replace(&mut *collector, self.get_new_collector()));
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
                            full_collectors
                                .push(replace(&mut *collector, self.get_new_collector()));
                        }
                    }
                }
            }
        }
        for mut global_collector in full_collectors {
            // When the global collector is full, we create a new SST file.
            let sst = self.create_sst_file(family, global_collector.sorted())?;
            global_collector.clear();
            self.new_sst_files.lock().push(sst);
            self.idle_collectors.lock().push(global_collector);
        }
        Ok(())
    }

    fn get_new_collector(&self) -> Collector<K> {
        self.idle_collectors
            .lock()
            .pop()
            .unwrap_or_else(|| Collector::new())
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

    /// Finishes the write batch by returning the new sequence number and the new SST files. This
    /// writes all outstanding thread local data to disk.
    pub(crate) fn finish(&mut self) -> Result<FinishResult> {
        let mut new_blob_files = Vec::new();
        let shared_error = Mutex::new(Ok(()));

        // First, we flush all thread local collectors to the global collectors.
        scope(|scope| {
            let mut collectors = [const { Vec::new() }; FAMILIES];
            for cell in self.thread_locals.iter_mut() {
                let state = cell.get_mut();
                new_blob_files.append(&mut state.new_blob_files);
                for (family, thread_local_collector) in state.collectors.iter_mut().enumerate() {
                    if let Some(collector) = thread_local_collector.take() {
                        if !collector.is_empty() {
                            collectors[family].push(collector);
                        }
                    }
                }
            }
            for (family, thread_local_collectors) in collectors.into_iter().enumerate() {
                for mut collector in thread_local_collectors {
                    let this = &self;
                    let shared_error = &shared_error;
                    scope.spawn(move |_| {
                        if let Err(err) =
                            this.flush_thread_local_collector(family as u32, &mut collector)
                        {
                            *shared_error.lock() = Err(err);
                        }
                        this.idle_thread_local_collectors.lock().push(collector);
                    });
                }
            }
        });

        // Now we reduce the global collectors in parallel
        let mut new_sst_files = take(self.new_sst_files.get_mut());
        let shared_new_sst_files = Mutex::new(&mut new_sst_files);

        let new_collectors = [(); FAMILIES]
            .map(|_| Mutex::new(GlobalCollectorState::Unsharded(self.get_new_collector())));
        let collectors = replace(&mut self.collectors, new_collectors);
        collectors
            .into_par_iter()
            .enumerate()
            .flat_map(|(family, state)| {
                let collector = state.into_inner();
                match collector {
                    GlobalCollectorState::Unsharded(collector) => {
                        Either::Left([(family, collector)].into_par_iter())
                    }
                    GlobalCollectorState::Sharded(shards) => Either::Right(
                        shards
                            .into_par_iter()
                            .map(move |collector| (family, collector)),
                    ),
                }
            })
            .try_for_each(|(family, mut collector)| {
                let family = family as u32;
                if !collector.is_empty() {
                    let sst = self.create_sst_file(family, collector.sorted())?;
                    collector.clear();
                    self.idle_collectors.lock().push(collector);
                    shared_new_sst_files.lock().push(sst);
                }
                anyhow::Ok(())
            })?;

        shared_error.into_inner()?;
        let seq = self.current_sequence_number.load(Ordering::SeqCst);
        new_sst_files.sort_by_key(|(seq, _)| *seq);
        Ok(FinishResult {
            sequence_number: seq,
            new_sst_files,
            new_blob_files,
        })
    }

    /// Creates a new blob file with the given value.
    /// Returns a tuple of (sequence number, file).
    fn create_blob(&self, value: &[u8]) -> Result<(u32, File)> {
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
        let mut buffer = Vec::new();
        buffer.write_u32::<BE>(value.len() as u32)?;
        lz4::compress_to_vec(value, &mut buffer, ACC_LEVEL_DEFAULT)
            .context("Compression of value for blob file failed")?;

        let file = self.path.join(format!("{:08}.blob", seq));
        let mut file = File::create(&file).context("Unable to create blob file")?;
        file.write_all(&buffer)
            .context("Unable to write blob file")?;
        file.flush().context("Unable to flush blob file")?;
        Ok((seq, file))
    }

    /// Creates a new SST file with the given collector data.
    /// Returns a tuple of (sequence number, file).
    fn create_sst_file(
        &self,
        family: u32,
        collector_data: (&[CollectorEntry<K>], usize, usize),
    ) -> Result<(u32, File)> {
        let (entries, total_key_size, total_value_size) = collector_data;
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

        let builder =
            StaticSortedFileBuilder::new(family, entries, total_key_size, total_value_size)?;

        let path = self.path.join(format!("{:08}.sst", seq));
        let file = builder
            .write(&path)
            .with_context(|| format!("Unable to write SST file {:08}.sst", seq))?;

        #[cfg(feature = "verify_sst_content")]
        {
            use core::panic;

            use crate::{
                collector_entry::CollectorEntryValue,
                key::hash_key,
                static_sorted_file::{AqmfCache, BlockCache, LookupResult, StaticSortedFile},
                static_sorted_file_builder::Entry,
            };

            file.sync_all()?;
            let sst = StaticSortedFile::open(seq, path)?;
            let cache1 = AqmfCache::with(
                10,
                u64::MAX,
                Default::default(),
                Default::default(),
                Default::default(),
            );
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
                    .lookup(
                        family,
                        hash_key(&key_buf),
                        &key_buf,
                        &cache1,
                        &cache2,
                        &cache3,
                    )
                    .expect("key found");
                key_buf.clear();
                match result {
                    LookupResult::Deleted => {}
                    LookupResult::Slice {
                        value: lookup_value,
                    } => {
                        let expected_value_slice = match &entry.value {
                            CollectorEntryValue::Small { value } => &**value,
                            CollectorEntryValue::Medium { value } => &**value,
                            _ => panic!("Unexpected value"),
                        };
                        assert_eq!(*lookup_value, *expected_value_slice);
                    }
                    LookupResult::Blob { sequence_number: _ } => {}
                    LookupResult::QuickFilterMiss => panic!("aqmf must include"),
                    LookupResult::RangeMiss => panic!("Index must cover"),
                    LookupResult::KeyMiss => panic!("All keys must exist"),
                }
            }
        }

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
