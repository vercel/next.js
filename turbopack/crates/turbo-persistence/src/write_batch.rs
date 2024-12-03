use std::{
    borrow::Cow,
    cell::UnsafeCell,
    fs::File,
    io::Write,
    mem::{replace, swap},
    path::PathBuf,
    sync::atomic::{AtomicU32, Ordering},
};

use anyhow::{Context, Result};
use byteorder::{WriteBytesExt, BE};
use lzzzz::lz4::{self, ACC_LEVEL_DEFAULT};
use parking_lot::Mutex;
use rayon::{
    iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator},
    scope, Scope,
};
use thread_local::ThreadLocal;

use crate::{
    collector::Collector, collector_entry::CollectorEntry, constants::MAX_MEDIUM_VALUE_SIZE,
    key::StoreKey, static_sorted_file_builder::StaticSortedFileBuilder,
};

/// The thread local state of a `WriteBatch`.
struct ThreadLocalState<K: StoreKey + Send, const FAMILIES: usize> {
    /// The collectors for each family.
    collectors: [Option<Collector<K>>; FAMILIES],
    /// The list of new SST files that have been created.
    new_sst_files: Vec<(u32, File)>,
    /// The list of new blob files that have been created.
    new_blob_files: Vec<File>,
}

/// The result of a `WriteBatch::finish` operation.
pub(crate) struct FinishResult {
    pub(crate) sequence_number: u32,
    pub(crate) new_sst_files: Vec<(u32, File)>,
    pub(crate) new_blob_files: Vec<File>,
}

/// A write batch.
pub struct WriteBatch<K: StoreKey + Send, const FAMILIES: usize> {
    /// The database path
    path: PathBuf,
    /// The current sequence number counter. Increased for every new SST file or blob file.
    current_sequence_number: AtomicU32,
    /// The thread local state.
    thread_locals: ThreadLocal<UnsafeCell<ThreadLocalState<K, FAMILIES>>>,
    /// Collectors are are current unused, but have memory preallocated.
    idle_collectors: Mutex<Vec<Collector<K>>>,
}

impl<K: StoreKey + Send + Sync, const FAMILIES: usize> WriteBatch<K, FAMILIES> {
    /// Creates a new write batch for a database.
    pub(crate) fn new(path: PathBuf, current: u32) -> Self {
        assert!(FAMILIES <= u32::MAX as usize);
        Self {
            path,
            current_sequence_number: AtomicU32::new(current),
            thread_locals: ThreadLocal::new(),
            idle_collectors: Mutex::new(Vec::new()),
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
                new_sst_files: Vec::new(),
                new_blob_files: Vec::new(),
            })
        });
        // Safety: We know that the cell is only accessed from the current thread.
        unsafe { &mut *cell.get() }
    }

    /// Returns the collector for a family for the current thread.
    fn collector_mut<'l>(
        &self,
        state: &'l mut ThreadLocalState<K, FAMILIES>,
        family: usize,
    ) -> Result<&'l mut Collector<K>> {
        debug_assert!(family < FAMILIES);
        let collector = state.collectors[family].get_or_insert_with(|| {
            self.idle_collectors
                .lock()
                .pop()
                .unwrap_or_else(|| Collector::new())
        });
        if collector.is_full() {
            let sst = self.create_sst_file(family, collector.sorted())?;
            collector.clear();
            state.new_sst_files.push(sst);
        }
        Ok(collector)
    }

    /// Puts a key-value pair into the write batch.
    pub fn put(&self, family: usize, key: K, value: Cow<'_, [u8]>) -> Result<()> {
        let state = self.thread_local_state();
        let collector = self.collector_mut(state, family)?;
        if value.len() <= MAX_MEDIUM_VALUE_SIZE {
            collector.put(key, value.into_owned());
        } else {
            let (blob, file) = self.create_blob(&value)?;
            collector.put_blob(key, blob);
            state.new_blob_files.push(file);
        }
        Ok(())
    }

    /// Puts a delete operation into the write batch.
    pub fn delete(&self, family: usize, key: K) -> Result<()> {
        let state = self.thread_local_state();
        let collector = self.collector_mut(state, family)?;
        collector.delete(key);
        Ok(())
    }

    /// Finishes the write batch by returning the new sequence number and the new SST files. This
    /// writes all outstanding thread local data to disk.
    pub(crate) fn finish(&mut self) -> Result<FinishResult> {
        let mut new_sst_files = Vec::new();
        let mut new_blob_files = Vec::new();
        let mut all_collectors = [(); FAMILIES].map(|_| Vec::new());
        for cell in self.thread_locals.iter_mut() {
            let state = cell.get_mut();
            new_sst_files.append(&mut state.new_sst_files);
            new_blob_files.append(&mut state.new_blob_files);
            for (family, global_collector) in all_collectors.iter_mut().enumerate() {
                if let Some(collector) = state.collectors[family].take() {
                    if !collector.is_empty() {
                        global_collector.push(Some(collector));
                    }
                }
            }
        }
        let shared_new_sst_files = Mutex::new(&mut new_sst_files);
        let shared_error = Mutex::new(Ok(()));
        scope(|scope| {
            fn handle_done_collector<'scope, K: StoreKey + Send + Sync, const FAMILIES: usize>(
                this: &'scope WriteBatch<K, FAMILIES>,
                scope: &Scope<'scope>,
                family: usize,
                mut collector: Collector<K>,
                shared_new_sst_files: &'scope Mutex<&mut Vec<(u32, File)>>,
                shared_error: &'scope Mutex<Result<()>>,
            ) {
                scope.spawn(
                    move |_| match this.create_sst_file(family, collector.sorted()) {
                        Ok(sst) => {
                            collector.clear();
                            this.idle_collectors.lock().push(collector);
                            shared_new_sst_files.lock().push(sst);
                        }
                        Err(err) => {
                            *shared_error.lock() = Err(err);
                        }
                    },
                );
            }

            all_collectors
                .into_par_iter()
                .enumerate()
                .for_each(|(family, collectors)| {
                    let final_collector = collectors.into_par_iter().reduce(
                        || None,
                        |a, b| match (a, b) {
                            (Some(mut a), Some(mut b)) => {
                                if a.len() < b.len() {
                                    swap(&mut a, &mut b);
                                }
                                for entry in b.drain() {
                                    if a.is_full() {
                                        let full_collector = replace(
                                            &mut a,
                                            self.idle_collectors
                                                .lock()
                                                .pop()
                                                .unwrap_or_else(|| Collector::new()),
                                        );
                                        handle_done_collector(
                                            self,
                                            scope,
                                            family,
                                            full_collector,
                                            &shared_new_sst_files,
                                            &shared_error,
                                        );
                                    }
                                    a.add_entry(entry);
                                }
                                self.idle_collectors.lock().push(b);
                                Some(a)
                            }
                            (Some(a), None) => Some(a),
                            (None, Some(b)) => Some(b),
                            (None, None) => None,
                        },
                    );
                    if let Some(collector) = final_collector {
                        handle_done_collector(
                            self,
                            scope,
                            family,
                            collector,
                            &shared_new_sst_files,
                            &shared_error,
                        );
                    }
                });
        });
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
    fn create_sst_file(
        &self,
        family: usize,
        collector_data: (&[CollectorEntry<K>], usize, usize),
    ) -> Result<(u32, File)> {
        let (entries, total_key_size, total_value_size) = collector_data;
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

        let builder =
            StaticSortedFileBuilder::new(family as u32, entries, total_key_size, total_value_size)?;

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
            for entry in entries {
                let mut key = Vec::with_capacity(entry.key.len());
                entry.key.write_to(&mut key);
                let result = sst
                    .lookup(hash_key(&key), &key, &cache1, &cache2, &cache3)
                    .expect("key found");
                match result {
                    LookupResult::Deleted => {}
                    LookupResult::Small { value: val } => {
                        if let EntryValue::Small { value } | EntryValue::Medium { value } =
                            entry.value
                        {
                            assert_eq!(&*val, &*value);
                        } else {
                            panic!("Unexpected value");
                        }
                    }
                    LookupResult::Blob { sequence_number } => {}
                    LookupResult::QuickFilterMiss => panic!("aqmf must include"),
                    LookupResult::RangeMiss => panic!("Index must cover"),
                    LookupResult::KeyMiss => panic!("All keys must exist"),
                }
            }
        }

        Ok((seq, file))
    }
}
