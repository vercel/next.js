use std::{
    borrow::Cow,
    cell::UnsafeCell,
    fs::File,
    mem::replace,
    path::PathBuf,
    sync::atomic::{AtomicU32, Ordering},
};

use anyhow::{Context, Result};
use byteorder::{WriteBytesExt, BE};
use lzzzz::lz4::{self, ACC_LEVEL_DEFAULT};
use rayon::iter::{IntoParallelRefMutIterator, ParallelIterator};
use thread_local::ThreadLocal;

use crate::{
    collector::Collector, collector_entry::CollectorEntry, constants::MAX_MEDIUM_VALUE_SIZE,
    key::StoreKey, static_sorted_file_builder::StaticSortedFileBuilder,
};

struct ThreadLocalState<K: StoreKey + Send, const FAMILIES: usize> {
    collectors: [Option<Collector<K>>; FAMILIES],
    new_sst_files: Vec<(u32, File)>,
}

pub struct WriteBatch<K: StoreKey + Send, const FAMILIES: usize> {
    path: PathBuf,
    current_sequence_number: AtomicU32,
    thread_locals: ThreadLocal<UnsafeCell<ThreadLocalState<K, FAMILIES>>>,
    idle_collectors: Vec<Collector<K>>,
}

impl<K: StoreKey + Send + Sync, const FAMILIES: usize> WriteBatch<K, FAMILIES> {
    pub fn new(path: PathBuf, current: u32) -> Self {
        assert!(FAMILIES <= u32::MAX as usize);
        Self {
            path,
            current_sequence_number: AtomicU32::new(current),
            thread_locals: ThreadLocal::new(),
            idle_collectors: Vec::new(),
        }
    }

    pub fn reset(&mut self, current: u32) {
        self.current_sequence_number
            .store(current, Ordering::SeqCst);
    }

    fn collector_mut(&self, family: usize) -> Result<&mut Collector<K>> {
        debug_assert!(family < FAMILIES);
        let cell = self.thread_locals.get_or(|| {
            UnsafeCell::new(ThreadLocalState {
                collectors: [const { None }; FAMILIES],
                new_sst_files: Vec::new(),
            })
        });
        // Safety: We know that the cell is only accessed from the current thread.
        let state = unsafe { &mut *cell.get() };
        let collector = state.collectors[family].get_or_insert_with(|| Collector::new());
        if collector.is_full() {
            let sst = self.create_sst_file(family, collector.sorted())?;
            collector.clear();
            state.new_sst_files.push(sst);
        }
        Ok(collector)
    }

    pub fn put(&self, family: usize, key: K, value: Cow<'_, [u8]>) -> Result<()> {
        let collector = self.collector_mut(family)?;
        if value.len() <= MAX_MEDIUM_VALUE_SIZE {
            collector.put(key, value.into_owned());
        } else {
            let blob = self.create_blob(&value)?;
            collector.put_blob(key, blob);
        }
        Ok(())
    }

    pub fn delete(&self, family: usize, key: K) -> Result<()> {
        let collector = self.collector_mut(family)?;
        collector.delete(key);
        Ok(())
    }

    pub fn finish(&mut self) -> Result<(u32, Vec<(u32, File)>)> {
        let mut global_collectors = [const { None }; FAMILIES];
        let mut full_global_collectors = Vec::new();
        let mut new_sst_files = Vec::new();
        for cell in self.thread_locals.iter_mut() {
            let state = cell.get_mut();
            new_sst_files.append(&mut state.new_sst_files);
            for family in 0..FAMILIES {
                if let Some(mut collector) = state.collectors[family].take() {
                    let global_collector = global_collectors[family].get_or_insert_with(|| {
                        self.idle_collectors
                            .pop()
                            .unwrap_or_else(|| Collector::new())
                    });
                    for entry in collector.drain() {
                        if global_collector.is_full() {
                            full_global_collectors.push((
                                family,
                                replace(
                                    global_collector,
                                    self.idle_collectors
                                        .pop()
                                        .unwrap_or_else(|| Collector::new()),
                                ),
                            ));
                        }
                        global_collector.add_entry(entry);
                    }
                    // Reuse the collector to avoid allocations.
                    self.idle_collectors.push(collector);
                }
            }
        }
        for (family, global_collector) in global_collectors.into_iter().enumerate() {
            if let Some(global_collector) = global_collector {
                if !global_collector.is_empty() {
                    full_global_collectors.push((family, global_collector));
                }
            }
        }
        new_sst_files.extend(
            full_global_collectors
                .par_iter_mut()
                .map(|(family, collector)| {
                    let result = self.create_sst_file(*family, collector.sorted());
                    collector.clear();
                    result
                })
                .collect::<Result<Vec<_>>>()?,
        );
        for (_, collector) in full_global_collectors {
            self.idle_collectors.push(collector);
        }
        for cell in self.thread_locals.iter_mut() {
            let state = cell.get_mut();
            for i in 0..FAMILIES {
                state.collectors[i] = self.idle_collectors.pop();
            }
        }
        let seq = self.current_sequence_number.load(Ordering::SeqCst);
        new_sst_files.sort_by_key(|(seq, _)| *seq);
        Ok((seq, new_sst_files))
    }

    fn create_blob(&self, value: &[u8]) -> Result<u32> {
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
        let mut buffer = Vec::new();
        buffer.write_u32::<BE>(value.len() as u32)?;
        lz4::compress_to_vec(value, &mut buffer, ACC_LEVEL_DEFAULT)
            .context("Compression of value for blob file failed")?;

        let file = self.path.join(&format!("{:08}.blob", seq));
        std::fs::write(file, &buffer).context("Unable to write blob file")?;
        Ok(seq)
    }

    fn create_sst_file(
        &self,
        family: usize,
        collector_data: (&[CollectorEntry<K>], usize, usize),
    ) -> Result<(u32, File)> {
        let (entries, total_key_size, total_value_size) = collector_data;
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

        let builder =
            StaticSortedFileBuilder::new(family as u32, entries, total_key_size, total_value_size);

        let path = self.path.join(&format!("{:08}.sst", seq));
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
