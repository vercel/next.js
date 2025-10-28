use std::{
    fs::File,
    hash::BuildHasherDefault,
    io::{BufReader, Seek},
    ops::Deref,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt};
use either::Either;
use memmap2::{Mmap, MmapOptions};
use quick_cache::sync::GuardResult;
use rustc_hash::FxHasher;

use crate::{
    QueryKey,
    static_sorted_file::{BlockCache, SstLookupResult, StaticSortedFile, StaticSortedFileMetaData},
};

#[derive(Clone, Default)]
pub struct AmqfWeighter;

impl quick_cache::Weighter<u32, Arc<qfilter::Filter>> for AmqfWeighter {
    fn weight(&self, _key: &u32, filter: &Arc<qfilter::Filter>) -> u64 {
        filter.capacity() + 1
    }
}

pub type AmqfCache =
    quick_cache::sync::Cache<u32, Arc<qfilter::Filter>, AmqfWeighter, BuildHasherDefault<FxHasher>>;

pub struct MetaEntry {
    /// The metadata for the static sorted file.
    sst_data: StaticSortedFileMetaData,
    /// The key family of the SST file.
    family: u32,
    /// The minimum hash value of the keys in the SST file.
    min_hash: u64,
    /// The maximum hash value of the keys in the SST file.
    max_hash: u64,
    /// The size of the SST file in bytes.
    size: u64,
    /// The offset of the start of the AMQF data in the meta file relative to the end of the
    /// header.
    start_of_amqf_data_offset: u32,
    /// The offset of the end of the AMQF data in the the meta file relative to the end of the
    /// header.
    end_of_amqf_data_offset: u32,
    /// The AMQF filter of this file. This is only used if the range is very large. Smaller ranges
    /// use the AMQF cache instead.
    amqf: OnceLock<qfilter::Filter>,
    /// The static sorted file that is lazily loaded
    sst: OnceLock<StaticSortedFile>,
}

impl MetaEntry {
    pub fn sequence_number(&self) -> u32 {
        self.sst_data.sequence_number
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn amqf_size(&self) -> u32 {
        self.end_of_amqf_data_offset - self.start_of_amqf_data_offset
    }

    pub fn raw_amqf<'l>(&self, amqf_data: &'l [u8]) -> &'l [u8] {
        amqf_data
            .get(self.start_of_amqf_data_offset as usize..self.end_of_amqf_data_offset as usize)
            .expect("AMQF data out of bounds")
    }

    pub fn deserialize_amqf(&self, meta: &MetaFile) -> Result<qfilter::Filter> {
        let amqf = self.raw_amqf(meta.amqf_data());
        pot::from_slice(amqf).with_context(|| {
            format!(
                "Failed to deserialize AMQF from {:08}.meta for {:08}.sst",
                meta.sequence_number,
                self.sequence_number()
            )
        })
    }

    pub fn amqf(
        &self,
        meta: &MetaFile,
        amqf_cache: &AmqfCache,
    ) -> Result<impl Deref<Target = qfilter::Filter>> {
        let use_amqf_cache = self.max_hash - self.min_hash < 1 << 60;
        Ok(if use_amqf_cache {
            let amqf = match amqf_cache.get_value_or_guard(&self.sequence_number(), None) {
                GuardResult::Value(amqf) => amqf,
                GuardResult::Guard(guard) => {
                    let amqf = self.deserialize_amqf(meta)?;
                    let amqf: Arc<qfilter::Filter> = Arc::new(amqf);
                    let _ = guard.insert(amqf.clone());
                    amqf
                }
                GuardResult::Timeout => unreachable!(),
            };
            Either::Left(amqf)
        } else {
            let amqf = self.amqf.get_or_try_init(|| {
                let amqf = self.deserialize_amqf(meta)?;
                anyhow::Ok(amqf)
            })?;
            Either::Right(amqf)
        })
    }

    pub fn sst(&self, meta: &MetaFile) -> Result<&StaticSortedFile> {
        self.sst.get_or_try_init(|| {
            StaticSortedFile::open(&meta.db_path, self.sst_data.clone()).with_context(|| {
                format!(
                    "Unable to open static sorted file referenced from {:08}.meta",
                    meta.sequence_number()
                )
            })
        })
    }

    /// Returns the key family and hash range of this file.
    pub fn range(&self) -> StaticSortedFileRange {
        StaticSortedFileRange {
            family: self.family,
            min_hash: self.min_hash,
            max_hash: self.max_hash,
        }
    }

    pub fn min_hash(&self) -> u64 {
        self.min_hash
    }

    pub fn max_hash(&self) -> u64 {
        self.max_hash
    }

    pub fn key_compression_dictionary_length(&self) -> u16 {
        self.sst_data.key_compression_dictionary_length
    }

    pub fn block_count(&self) -> u16 {
        self.sst_data.block_count
    }
}

/// The result of a lookup operation.
pub enum MetaLookupResult {
    /// The key was not found because it is from a different key family.
    FamilyMiss,
    /// The key was not found because it is out of the range of this SST file. But it was the
    /// correct key family.
    RangeMiss,
    /// The key was not found because it was not in the AMQF filter. But it was in the range.
    QuickFilterMiss,
    /// The key was looked up in the SST file. It was in the AMQF filter.
    SstLookup(SstLookupResult),
}

/// The key family and hash range of an SST file.
#[derive(Clone, Copy)]
pub struct StaticSortedFileRange {
    pub family: u32,
    pub min_hash: u64,
    pub max_hash: u64,
}

pub struct MetaFile {
    /// The database path
    db_path: PathBuf,
    /// The sequence number of this file.
    sequence_number: u32,
    /// The key family of the SST files in this meta file.
    family: u32,
    /// The entries of the file.
    entries: Vec<MetaEntry>,
    /// The entries that have been marked as obsolete.
    obsolete_entries: Vec<u32>,
    /// The obsolete SST files.
    obsolete_sst_files: Vec<u32>,
    /// The memory mapped file.
    mmap: Mmap,
}

impl MetaFile {
    /// Opens a meta file at the given path. This memory maps the file, but does not read it yet.
    /// It's lazy read on demand.
    pub fn open(db_path: &Path, sequence_number: u32) -> Result<Self> {
        let filename = format!("{sequence_number:08}.meta");
        let path = db_path.join(&filename);
        Self::open_internal(db_path.to_path_buf(), sequence_number, &path)
            .with_context(|| format!("Unable to open meta file {filename}"))
    }

    fn open_internal(db_path: PathBuf, sequence_number: u32, path: &Path) -> Result<Self> {
        let mut file = BufReader::new(File::open(path)?);
        let magic = file.read_u32::<BE>()?;
        if magic != 0xFE4ADA4A {
            bail!("Invalid magic number");
        }
        let family = file.read_u32::<BE>()?;
        let obsolete_count = file.read_u32::<BE>()?;
        let mut obsolete_sst_files = Vec::with_capacity(obsolete_count as usize);
        for _ in 0..obsolete_count {
            let obsolete_sst = file.read_u32::<BE>()?;
            obsolete_sst_files.push(obsolete_sst);
        }
        let count = file.read_u32::<BE>()?;
        let mut entries = Vec::with_capacity(count as usize);
        let mut start_of_amqf_data_offset = 0;
        for _ in 0..count {
            let entry = MetaEntry {
                sst_data: StaticSortedFileMetaData {
                    sequence_number: file.read_u32::<BE>()?,
                    key_compression_dictionary_length: file.read_u16::<BE>()?,
                    block_count: file.read_u16::<BE>()?,
                },
                family,
                min_hash: file.read_u64::<BE>()?,
                max_hash: file.read_u64::<BE>()?,
                size: file.read_u64::<BE>()?,
                start_of_amqf_data_offset,
                end_of_amqf_data_offset: file.read_u32::<BE>()?,
                amqf: OnceLock::new(),
                sst: OnceLock::new(),
            };
            start_of_amqf_data_offset = entry.end_of_amqf_data_offset;
            entries.push(entry);
        }
        let offset = file.stream_position()?;
        let file = file.into_inner();
        let mut options = MmapOptions::new();
        options.offset(offset);
        let mmap = unsafe { options.map(&file)? };
        #[cfg(unix)]
        mmap.advise(memmap2::Advice::Random)?;
        let file = Self {
            db_path,
            sequence_number,
            family,
            entries,
            obsolete_entries: Vec::new(),
            obsolete_sst_files,
            mmap,
        };
        Ok(file)
    }

    pub fn sequence_number(&self) -> u32 {
        self.sequence_number
    }

    pub fn family(&self) -> u32 {
        self.family
    }

    pub fn entries(&self) -> &[MetaEntry] {
        &self.entries
    }

    pub fn entry(&self, index: u32) -> &MetaEntry {
        let index = index as usize;
        &self.entries[index]
    }

    pub fn amqf_data(&self) -> &[u8] {
        &self.mmap
    }

    pub fn retain_entries(&mut self, mut predicate: impl FnMut(u32) -> bool) -> bool {
        let old_len = self.entries.len();
        self.entries.retain(|entry| {
            if predicate(entry.sst_data.sequence_number) {
                true
            } else {
                self.obsolete_entries.push(entry.sst_data.sequence_number);
                false
            }
        });
        old_len != self.entries.len()
    }

    pub fn obsolete_entries(&self) -> &[u32] {
        &self.obsolete_entries
    }

    pub fn has_active_entries(&self) -> bool {
        !self.entries.is_empty()
    }

    pub fn obsolete_sst_files(&self) -> &[u32] {
        &self.obsolete_sst_files
    }

    pub fn lookup<K: QueryKey>(
        &self,
        key_family: u32,
        key_hash: u64,
        key: &K,
        amqf_cache: &AmqfCache,
        key_block_cache: &BlockCache,
        value_block_cache: &BlockCache,
    ) -> Result<MetaLookupResult> {
        if key_family != self.family {
            return Ok(MetaLookupResult::FamilyMiss);
        }
        let mut miss_result = MetaLookupResult::RangeMiss;
        for entry in self.entries.iter().rev() {
            if key_hash < entry.min_hash || key_hash > entry.max_hash {
                continue;
            }
            {
                let amqf = entry.amqf(self, amqf_cache)?;
                if !amqf.contains_fingerprint(key_hash) {
                    miss_result = MetaLookupResult::QuickFilterMiss;
                    continue;
                }
            }
            let result =
                entry
                    .sst(self)?
                    .lookup(key_hash, key, key_block_cache, value_block_cache)?;
            if !matches!(result, SstLookupResult::NotFound) {
                return Ok(MetaLookupResult::SstLookup(result));
            }
        }
        Ok(miss_result)
    }
}
