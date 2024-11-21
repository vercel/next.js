use std::{
    borrow::Cow,
    cell::UnsafeCell,
    fs::File,
    mem::take,
    path::PathBuf,
    sync::atomic::{AtomicU32, Ordering},
};

use anyhow::{Context, Result};
use byteorder::{WriteBytesExt, BE};
use lzzzz::lz4::{self, ACC_LEVEL_DEFAULT};
use thread_local::ThreadLocal;

use crate::{
    collector::Collector, constants::MAX_MEDIUM_VALUE_SIZE, entry::Entry, key::StoreKey,
    static_sorted_file_builder::StaticSortedFileBuilder,
};

struct ThreadLocalState<K: StoreKey + Send> {
    collector: Collector<K>,
    new_sst_files: Vec<(u32, File)>,
}

pub struct WriteBatch<K: StoreKey + Send> {
    path: PathBuf,
    current_sequence_number: AtomicU32,
    collectors: ThreadLocal<UnsafeCell<ThreadLocalState<K>>>,
}

impl<K: StoreKey + Send> WriteBatch<K> {
    pub fn new(path: PathBuf, current: u32) -> Self {
        Self {
            path,
            current_sequence_number: AtomicU32::new(current),
            collectors: ThreadLocal::new(),
        }
    }

    fn collector_mut(&self) -> Result<&mut Collector<K>> {
        let cell = self.collectors.get_or(|| {
            UnsafeCell::new(ThreadLocalState {
                collector: Collector::new(),
                new_sst_files: Vec::new(),
            })
        });
        // Safety: We know that the cell is only accessed from the current thread.
        let state = unsafe { &mut *cell.get() };
        if state.collector.is_full() {
            state
                .new_sst_files
                .push(self.create_sst_file(state.collector.drain_sorted())?);
        }
        Ok(&mut state.collector)
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

    pub fn finish(mut self) -> Result<(u32, Vec<(u32, File)>)> {
        let mut global_collector = Collector::new();
        let mut new_sst_files = Vec::new();
        for cell in take(&mut self.collectors).into_iter() {
            let mut state = cell.into_inner();
            new_sst_files.append(&mut state.new_sst_files);
            for entry in state.collector.into_entries() {
                if global_collector.is_full() {
                    new_sst_files.push(self.create_sst_file(global_collector.drain_sorted())?);
                }
                global_collector.add_entry(entry);
            }
        }
        if !global_collector.is_empty() {
            new_sst_files.push(self.create_sst_file(global_collector.drain_sorted())?);
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
        collector_data: (Vec<Entry<K>>, usize, usize),
    ) -> Result<(u32, File)> {
        let (entries, total_key_size, total_value_size) = collector_data;
        let seq = self.current_sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

        let builder = StaticSortedFileBuilder::new(&entries, total_key_size, total_value_size);

        let path = self.path.join(&format!("{:08}.sst", seq));
        let file = builder
            .write(&path)
            .with_context(|| format!("Unable to write SST file {:08}.sst", seq))?;

        #[cfg(feature = "verify_sst_content")]
        {
            use core::panic;

            use crate::{
                entry::EntryValue,
                static_sorted_file::{AqmfCache, BlockCache, LookupResult, StaticSortedFile},
            };

            file.sync_all();
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
                    .lookup(&key, &cache1, &cache2, &cache3)
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
