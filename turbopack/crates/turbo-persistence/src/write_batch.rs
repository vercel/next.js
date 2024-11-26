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

struct ThreadLocalState<K: StoreKey + Send> {
    collector: Option<Collector<K>>,
    new_sst_files: Vec<(u32, File)>,
}

pub struct WriteBatch<K: StoreKey + Send> {
    path: PathBuf,
    current_sequence_number: AtomicU32,
    thread_locals: ThreadLocal<UnsafeCell<ThreadLocalState<K>>>,
    idle_collectors: Vec<Collector<K>>,
}

impl<K: StoreKey + Send + Sync> WriteBatch<K> {
    pub fn new(path: PathBuf, current: u32) -> Self {
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

    fn collector_mut(&self) -> Result<&mut Collector<K>> {
        let cell = self.thread_locals.get_or(|| {
            UnsafeCell::new(ThreadLocalState {
                collector: Some(Collector::new()),
                new_sst_files: Vec::new(),
            })
        });
        // Safety: We know that the cell is only accessed from the current thread.
        let state = unsafe { &mut *cell.get() };
        let collector = state.collector.get_or_insert_with(|| Collector::new());
        if collector.is_full() {
            let sst = self.create_sst_file(collector.sorted())?;
            collector.clear();
            state.new_sst_files.push(sst);
        }
        Ok(state.collector.as_mut().unwrap())
    }

    pub fn put(&self, key: K, value: Cow<'_, [u8]>) -> Result<()> {
        let collector = self.collector_mut()?;
        if value.len() <= MAX_MEDIUM_VALUE_SIZE {
            collector.put(key, value.into_owned());
        } else {
            let blob = self.create_blob(&value)?;
            collector.put_blob(key, blob);
        }
        Ok(())
    }

    pub fn delete(&self, key: K) -> Result<()> {
        let collector = self.collector_mut()?;
        collector.delete(key);
        Ok(())
    }

    pub fn finish(&mut self) -> Result<(u32, Vec<(u32, File)>)> {
        let mut global_collector = Collector::new();
        let mut global_collectors = Vec::new();
        let mut new_sst_files = Vec::new();
        for cell in self.thread_locals.iter_mut() {
            let state = cell.get_mut();
            new_sst_files.append(&mut state.new_sst_files);
            if let Some(mut collector) = state.collector.take() {
                for entry in collector.drain() {
                    if global_collector.is_full() {
                        global_collectors.push(replace(
                            &mut global_collector,
                            self.idle_collectors
                                .pop()
                                .unwrap_or_else(|| Collector::new()),
                        ));
                    }
                    global_collector.add_entry(entry);
                }
                // Reuse the collector to avoid allocations.
                self.idle_collectors.push(collector);
            }
        }
        if !global_collector.is_empty() {
            global_collectors.push(global_collector);
        }
        new_sst_files.extend(
            global_collectors
                .par_iter_mut()
                .map(|collector| {
                    let result = self.create_sst_file(collector.sorted());
                    collector.clear();
                    result
                })
                .collect::<Result<Vec<_>>>()?,
        );
        self.idle_collectors.append(&mut global_collectors);
        for cell in self.thread_locals.iter_mut() {
            let state = cell.get_mut();
            state.collector = self.idle_collectors.pop();
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
        collector_data: (&[CollectorEntry<K>], usize, usize),
    ) -> Result<(u32, File)> {
        let (entries, total_key_size, total_value_size) = collector_data;
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

        let builder = StaticSortedFileBuilder::new(entries, total_key_size, total_value_size);

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
