use std::{
    cmp::Ordering,
    fmt::Display,
    fs::File,
    hash::BuildHasherDefault,
    io::{BufReader, Seek},
    ops::Deref,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
};

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use bitfield::bitfield;
use byteorder::{BE, ReadBytesExt};
use either::Either;
use memmap2::{Mmap, MmapOptions};
use quick_cache::sync::GuardResult;
use rustc_hash::FxHasher;
use turbo_bincode::turbo_bincode_decode;

use crate::{
    ArcSlice, QueryKey,
    family_format::key_to_range_value,
    lookup_entry::LookupValue,
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

bitfield! {
    #[derive(Clone, Copy, Default)]
    pub struct MetaEntryFlags(u32);
    impl Debug;
    impl From<u32>;
    /// The SST file was compacted and none of the entries have been accessed recently.
    pub cold, set_cold: 0;
    /// The SST file was freshly written and has not been compacted yet.
    pub fresh, set_fresh: 1;
    /// The SST file uses direct key storage (no hashing). Keys are stored as raw bytes.
    pub direct_key, set_direct_key: 2;
    /// The SST file uses fixed-size value storage (inline with keys).
    pub fixed_value, set_fixed_value: 3;
    /// The SST file is stored uncompressed (for high-entropy data).
    pub uncompressed, set_uncompressed: 4;
    /// Fixed key size in bytes (bits 8-15). Only valid if direct_key is set.
    pub u8, key_size, set_key_size: 15, 8;
    /// Fixed value size in bytes (bits 16-23). Only valid if fixed_value is set.
    pub u8, value_size, set_value_size: 23, 16;
}

impl MetaEntryFlags {
    pub const FRESH: MetaEntryFlags = MetaEntryFlags(0b10);
    pub const COLD: MetaEntryFlags = MetaEntryFlags(0b01);
    pub const WARM: MetaEntryFlags = MetaEntryFlags(0b00);

    /// Create flags for a direct-key SST with variable values.
    pub fn direct_key_variable(key_size: u8) -> Self {
        let mut flags = Self::FRESH;
        flags.set_direct_key(true);
        flags.set_key_size(key_size);
        flags
    }

    /// Create flags for a direct-key SST with fixed values and no compression.
    pub fn direct_key_fixed(key_size: u8, value_size: u8) -> Self {
        let mut flags = Self::FRESH;
        flags.set_direct_key(true);
        flags.set_fixed_value(true);
        flags.set_uncompressed(true);
        flags.set_key_size(key_size);
        flags.set_value_size(value_size);
        flags
    }

    /// Returns true if this SST uses direct key storage (no hashing).
    #[inline]
    pub fn uses_direct_keys(&self) -> bool {
        self.direct_key()
    }

    /// Returns true if this SST uses fixed-size inline value storage.
    #[inline]
    pub fn uses_fixed_values(&self) -> bool {
        self.fixed_value()
    }

    /// Returns true if this SST is stored uncompressed.
    #[inline]
    pub fn is_uncompressed(&self) -> bool {
        self.uncompressed()
    }

    /// Returns the entry size for fully fixed-layout SSTs, or None if not applicable.
    #[inline]
    pub fn entry_size(&self) -> Option<usize> {
        if self.direct_key() && self.fixed_value() {
            Some(self.key_size() as usize + self.value_size() as usize)
        } else {
            None
        }
    }
}

impl Display for MetaEntryFlags {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut parts = Vec::new();

        // Compaction status
        if self.fresh() {
            parts.push("fresh".to_string());
        } else if self.cold() {
            parts.push("cold".to_string());
        } else {
            parts.push("warm".to_string());
        }

        // Format flags
        if self.direct_key() {
            parts.push(format!("direct_key({})", self.key_size()));
        }
        if self.fixed_value() {
            parts.push(format!("fixed_value({})", self.value_size()));
        }
        if self.uncompressed() {
            parts.push("uncompressed".to_string());
        }

        write!(f, "{}", parts.join(","))
    }
}

/// A wrapper around [`qfilter::Filter`] that implements [`Encode`] and [`Decode`].
#[derive(Encode, Decode)]
pub struct AmqfBincodeWrapper(
    // this annotation can be replaced with `#[bincode(serde)]` once
    // <https://github.com/arthurprs/qfilter/issues/13> is resolved
    #[bincode(with = "turbo_bincode::serde_self_describing")] pub qfilter::Filter,
);

/// The format type of a meta file.
///
/// This determines how entries are stored and interpreted.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum MetaFileFormat {
    /// Standard hashed key format with AMQF filters.
    /// Uses 8-byte key hashes for range checks.
    Hashed = 0,
    /// Direct u32 key format with fixed-size values.
    /// No AMQF filter, uses simple key range checks.
    DirectFixed = 1,
    /// Direct u32 key format with variable-size values.
    /// No AMQF filter, uses simple key range checks.
    DirectVariable = 2,
}

impl MetaFileFormat {
    fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::Hashed),
            1 => Some(Self::DirectFixed),
            2 => Some(Self::DirectVariable),
            _ => None,
        }
    }
}

/// Entry for hashed key format (standard format with AMQF).
pub struct HashedMetaEntry {
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
    /// The status flags for this entry.
    flags: MetaEntryFlags,
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

/// Entry for direct-key fixed-value format.
///
/// Uses u32 keys directly (no hashing) with fixed-size inline values.
/// No AMQF filter - uses simple key range checks.
pub struct DirectFixedMetaEntry {
    /// The sequence number of the SST file.
    sequence_number: u32,
    /// The key family of the SST file.
    family: u32,
    /// The minimum key value (rotated).
    min_key: u32,
    /// The maximum key value (rotated).
    max_key: u32,
    /// The size of the SST file in bytes.
    size: u64,
    /// The status flags for this entry.
    flags: MetaEntryFlags,
    /// The static sorted file that is lazily loaded
    sst: OnceLock<StaticSortedFile>,
}

/// Entry for direct-key variable-value format.
///
/// Uses u32 keys directly (no hashing) with variable-size values in compressed blocks.
/// No AMQF filter - uses simple key range checks.
pub struct DirectVariableMetaEntry {
    /// The sequence number of the SST file.
    sequence_number: u32,
    /// The key family of the SST file.
    family: u32,
    /// The minimum key value (rotated).
    min_key: u32,
    /// The maximum key value (rotated).
    max_key: u32,
    /// The size of the SST file in bytes.
    size: u64,
    /// The number of blocks in the SST file.
    block_count: u16,
    /// The status flags for this entry.
    flags: MetaEntryFlags,
    /// The static sorted file that is lazily loaded
    sst: OnceLock<StaticSortedFile>,
}

/// A meta file entry, which can be one of several formats.
pub enum MetaEntry {
    /// Standard hashed key format with AMQF.
    Hashed(HashedMetaEntry),
    /// Direct u32 key format with fixed-size values.
    DirectFixed(DirectFixedMetaEntry),
    /// Direct u32 key format with variable-size values.
    DirectVariable(DirectVariableMetaEntry),
}

impl HashedMetaEntry {
    pub fn sequence_number(&self) -> u32 {
        self.sst_data.sequence_number
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn flags(&self) -> MetaEntryFlags {
        self.flags
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
        Ok(turbo_bincode_decode::<AmqfBincodeWrapper>(amqf)
            .with_context(|| {
                format!(
                    "Failed to deserialize AMQF from {:08}.meta for {:08}.sst",
                    meta.sequence_number,
                    self.sequence_number()
                )
            })?
            .0)
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

impl DirectFixedMetaEntry {
    pub fn sequence_number(&self) -> u32 {
        self.sequence_number
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn flags(&self) -> MetaEntryFlags {
        self.flags
    }

    pub fn min_key(&self) -> u32 {
        self.min_key
    }

    pub fn max_key(&self) -> u32 {
        self.max_key
    }

    /// Returns the key family and key range of this file (as u64 for compatibility).
    pub fn range(&self) -> StaticSortedFileRange {
        StaticSortedFileRange {
            family: self.family,
            min_hash: (self.min_key as u64) << 32,
            max_hash: (self.max_key as u64) << 32,
        }
    }

    pub fn sst(&self, meta: &MetaFile) -> Result<&StaticSortedFile> {
        self.sst.get_or_try_init(|| {
            StaticSortedFile::open(
                &meta.db_path,
                StaticSortedFileMetaData {
                    sequence_number: self.sequence_number,
                    key_compression_dictionary_length: 0,
                    block_count: 1,
                },
            )
            .with_context(|| {
                format!(
                    "Unable to open static sorted file referenced from {:08}.meta",
                    meta.sequence_number()
                )
            })
        })
    }
}

impl DirectVariableMetaEntry {
    pub fn sequence_number(&self) -> u32 {
        self.sequence_number
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn flags(&self) -> MetaEntryFlags {
        self.flags
    }

    pub fn min_key(&self) -> u32 {
        self.min_key
    }

    pub fn max_key(&self) -> u32 {
        self.max_key
    }

    pub fn block_count(&self) -> u16 {
        self.block_count
    }

    /// Returns the key family and key range of this file (as u64 for compatibility).
    pub fn range(&self) -> StaticSortedFileRange {
        StaticSortedFileRange {
            family: self.family,
            min_hash: (self.min_key as u64) << 32,
            max_hash: (self.max_key as u64) << 32,
        }
    }

    pub fn sst(&self, meta: &MetaFile) -> Result<&StaticSortedFile> {
        self.sst.get_or_try_init(|| {
            StaticSortedFile::open(
                &meta.db_path,
                StaticSortedFileMetaData {
                    sequence_number: self.sequence_number,
                    key_compression_dictionary_length: 0,
                    block_count: self.block_count,
                },
            )
            .with_context(|| {
                format!(
                    "Unable to open static sorted file referenced from {:08}.meta",
                    meta.sequence_number()
                )
            })
        })
    }
}

impl MetaEntry {
    pub fn sequence_number(&self) -> u32 {
        match self {
            MetaEntry::Hashed(e) => e.sequence_number(),
            MetaEntry::DirectFixed(e) => e.sequence_number(),
            MetaEntry::DirectVariable(e) => e.sequence_number(),
        }
    }

    pub fn size(&self) -> u64 {
        match self {
            MetaEntry::Hashed(e) => e.size(),
            MetaEntry::DirectFixed(e) => e.size(),
            MetaEntry::DirectVariable(e) => e.size(),
        }
    }

    pub fn flags(&self) -> MetaEntryFlags {
        match self {
            MetaEntry::Hashed(e) => e.flags(),
            MetaEntry::DirectFixed(e) => e.flags(),
            MetaEntry::DirectVariable(e) => e.flags(),
        }
    }

    /// Returns the key family and hash/key range of this file.
    pub fn range(&self) -> StaticSortedFileRange {
        match self {
            MetaEntry::Hashed(e) => e.range(),
            MetaEntry::DirectFixed(e) => e.range(),
            MetaEntry::DirectVariable(e) => e.range(),
        }
    }

    /// Returns min_hash for hashed entries, or min_key shifted to u64 for direct entries.
    pub fn min_hash(&self) -> u64 {
        match self {
            MetaEntry::Hashed(e) => e.min_hash(),
            MetaEntry::DirectFixed(e) => (e.min_key() as u64) << 32,
            MetaEntry::DirectVariable(e) => (e.min_key() as u64) << 32,
        }
    }

    /// Returns max_hash for hashed entries, or max_key shifted to u64 for direct entries.
    pub fn max_hash(&self) -> u64 {
        match self {
            MetaEntry::Hashed(e) => e.max_hash(),
            MetaEntry::DirectFixed(e) => (e.max_key() as u64) << 32,
            MetaEntry::DirectVariable(e) => (e.max_key() as u64) << 32,
        }
    }

    /// Returns block_count (only meaningful for hashed and direct-variable).
    pub fn block_count(&self) -> u16 {
        match self {
            MetaEntry::Hashed(e) => e.block_count(),
            MetaEntry::DirectFixed(_) => 1,
            MetaEntry::DirectVariable(e) => e.block_count(),
        }
    }

    /// Returns key_compression_dictionary_length (only meaningful for hashed).
    pub fn key_compression_dictionary_length(&self) -> u16 {
        match self {
            MetaEntry::Hashed(e) => e.key_compression_dictionary_length(),
            MetaEntry::DirectFixed(_) | MetaEntry::DirectVariable(_) => 0,
        }
    }

    /// Returns the AMQF size (only valid for hashed entries).
    pub fn amqf_size(&self) -> u32 {
        match self {
            MetaEntry::Hashed(e) => e.amqf_size(),
            MetaEntry::DirectFixed(_) | MetaEntry::DirectVariable(_) => 0,
        }
    }

    /// Returns raw AMQF data (only valid for hashed entries).
    pub fn raw_amqf<'l>(&self, amqf_data: &'l [u8]) -> &'l [u8] {
        match self {
            MetaEntry::Hashed(e) => e.raw_amqf(amqf_data),
            MetaEntry::DirectFixed(_) | MetaEntry::DirectVariable(_) => &[],
        }
    }

    /// Returns the hashed entry if this is a hashed format.
    pub fn as_hashed(&self) -> Option<&HashedMetaEntry> {
        match self {
            MetaEntry::Hashed(e) => Some(e),
            _ => None,
        }
    }

    /// Returns the direct-fixed entry if this is a direct-fixed format.
    pub fn as_direct_fixed(&self) -> Option<&DirectFixedMetaEntry> {
        match self {
            MetaEntry::DirectFixed(e) => Some(e),
            _ => None,
        }
    }

    /// Returns the direct-variable entry if this is a direct-variable format.
    pub fn as_direct_variable(&self) -> Option<&DirectVariableMetaEntry> {
        match self {
            MetaEntry::DirectVariable(e) => Some(e),
            _ => None,
        }
    }

    /// Returns a reference to the SST file for this entry.
    pub fn sst(&self, meta: &MetaFile) -> Result<&StaticSortedFile> {
        match self {
            MetaEntry::Hashed(e) => e.sst(meta),
            MetaEntry::DirectFixed(e) => e.sst(meta),
            MetaEntry::DirectVariable(e) => e.sst(meta),
        }
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

/// The result of a batch lookup operation.
#[derive(Default)]
pub struct MetaBatchLookupResult {
    /// The key was not found because it is from a different key family.
    #[cfg(feature = "stats")]
    pub family_miss: bool,
    /// The key was not found because it is out of the range of this SST file. But it was the
    /// correct key family.
    #[cfg(feature = "stats")]
    pub range_misses: usize,
    /// The key was not found because it was not in the AMQF filter. But it was in the range.
    #[cfg(feature = "stats")]
    pub quick_filter_misses: usize,
    /// The key was unsuccessfully looked up in the SST file. It was in the AMQF filter.
    #[cfg(feature = "stats")]
    pub sst_misses: usize,
    /// The key was found in the SST file.
    #[cfg(feature = "stats")]
    pub hits: usize,
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
    /// The offset of the start of the "used keys" AMQF data in the meta file relative to the end
    /// of the header.
    start_of_used_keys_amqf_data_offset: u32,
    /// The offset of the end of the "used keys" AMQF data in the the meta file relative to the end
    /// of the header.
    end_of_used_keys_amqf_data_offset: u32,
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

        // Read format byte
        let format_byte = file.read_u8()?;
        let format = MetaFileFormat::from_u8(format_byte)
            .with_context(|| format!("Invalid meta file format byte: {format_byte}"))?;

        let obsolete_count = file.read_u32::<BE>()?;
        let mut obsolete_sst_files = Vec::with_capacity(obsolete_count as usize);
        for _ in 0..obsolete_count {
            let obsolete_sst = file.read_u32::<BE>()?;
            obsolete_sst_files.push(obsolete_sst);
        }
        let count = file.read_u32::<BE>()?;
        let mut entries = Vec::with_capacity(count as usize);

        // Track AMQF offsets (only used for hashed format)
        let mut start_of_amqf_data_offset = 0u32;
        let mut start_of_used_keys_amqf_data_offset = 0u32;
        let mut end_of_used_keys_amqf_data_offset = 0u32;

        match format {
            MetaFileFormat::Hashed => {
                for _ in 0..count {
                    let hashed_entry = HashedMetaEntry {
                        sst_data: StaticSortedFileMetaData {
                            sequence_number: file.read_u32::<BE>()?,
                            key_compression_dictionary_length: file.read_u16::<BE>()?,
                            block_count: file.read_u16::<BE>()?,
                        },
                        family,
                        min_hash: file.read_u64::<BE>()?,
                        max_hash: file.read_u64::<BE>()?,
                        size: file.read_u64::<BE>()?,
                        flags: MetaEntryFlags(file.read_u32::<BE>()?),
                        start_of_amqf_data_offset,
                        end_of_amqf_data_offset: file.read_u32::<BE>()?,
                        amqf: OnceLock::new(),
                        sst: OnceLock::new(),
                    };
                    start_of_amqf_data_offset = hashed_entry.end_of_amqf_data_offset;
                    entries.push(MetaEntry::Hashed(hashed_entry));
                }
                start_of_used_keys_amqf_data_offset = start_of_amqf_data_offset;
                end_of_used_keys_amqf_data_offset = file.read_u32::<BE>()?;
            }
            MetaFileFormat::DirectFixed => {
                // Direct-fixed format: seq_num(4) + min_key(4) + max_key(4) + size(8) + flags(4) =
                // 24 bytes
                for _ in 0..count {
                    let entry = DirectFixedMetaEntry {
                        sequence_number: file.read_u32::<BE>()?,
                        family,
                        min_key: file.read_u32::<BE>()?,
                        max_key: file.read_u32::<BE>()?,
                        size: file.read_u64::<BE>()?,
                        flags: MetaEntryFlags(file.read_u32::<BE>()?),
                        sst: OnceLock::new(),
                    };
                    entries.push(MetaEntry::DirectFixed(entry));
                }
                // No AMQF data for direct formats
            }
            MetaFileFormat::DirectVariable => {
                // Direct-variable format: seq_num(4) + min_key(4) + max_key(4) + size(8) +
                // block_count(2) + flags(4) = 26 bytes
                for _ in 0..count {
                    let entry = DirectVariableMetaEntry {
                        sequence_number: file.read_u32::<BE>()?,
                        family,
                        min_key: file.read_u32::<BE>()?,
                        max_key: file.read_u32::<BE>()?,
                        size: file.read_u64::<BE>()?,
                        block_count: file.read_u16::<BE>()?,
                        flags: MetaEntryFlags(file.read_u32::<BE>()?),
                        sst: OnceLock::new(),
                    };
                    entries.push(MetaEntry::DirectVariable(entry));
                }
                // No AMQF data for direct formats
            }
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
            start_of_used_keys_amqf_data_offset,
            end_of_used_keys_amqf_data_offset,
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

    pub fn deserialize_used_key_hashes_amqf(&self) -> Result<Option<qfilter::Filter>> {
        if self.start_of_used_keys_amqf_data_offset == self.end_of_used_keys_amqf_data_offset {
            return Ok(None);
        }
        let amqf = &self.amqf_data()[self.start_of_used_keys_amqf_data_offset as usize
            ..self.end_of_used_keys_amqf_data_offset as usize];
        Ok(Some(pot::from_slice(amqf).with_context(|| {
            format!(
                "Failed to deserialize used key hashes AMQF from {:08}.meta",
                self.sequence_number
            )
        })?))
    }

    pub fn retain_entries(&mut self, mut predicate: impl FnMut(u32) -> bool) -> bool {
        let old_len = self.entries.len();
        self.entries.retain(|entry| {
            let seq = entry.sequence_number();
            if predicate(seq) {
                true
            } else {
                self.obsolete_entries.push(seq);
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
            // Hashed lookup only works with hashed format entries
            let hashed_entry = entry
                .as_hashed()
                .expect("lookup called on non-hashed entry");
            if key_hash < hashed_entry.min_hash() || key_hash > hashed_entry.max_hash() {
                continue;
            }
            {
                let amqf = hashed_entry.amqf(self, amqf_cache)?;
                if !amqf.contains_fingerprint(key_hash) {
                    miss_result = MetaLookupResult::QuickFilterMiss;
                    continue;
                }
            }
            let result = hashed_entry.sst(self)?.lookup(
                key_hash,
                key,
                key_block_cache,
                value_block_cache,
            )?;
            if !matches!(result, SstLookupResult::NotFound) {
                return Ok(MetaLookupResult::SstLookup(result));
            }
        }
        Ok(miss_result)
    }

    /// Lookup for direct-key fixed-value format.
    ///
    /// This is optimized for families with u32 integer keys and fixed-size values
    /// stored inline without compression (e.g., TaskIdToTaskTypeHash).
    ///
    /// The key is a u32 (e.g., TaskId). It will be rotated internally for lookup.
    /// No AMQF filter is used - only key range checks.
    pub fn lookup_direct_fixed<const VALUE_SIZE: usize>(
        &self,
        key_family: u32,
        key: u32,
    ) -> Result<MetaLookupResult> {
        if key_family != self.family {
            return Ok(MetaLookupResult::FamilyMiss);
        }

        // Convert key to range value for range checks (rotated, in high 32 bits)
        let key_range_value = key_to_range_value(key);

        for entry in self.entries.iter().rev() {
            let direct_entry = entry
                .as_direct_fixed()
                .expect("lookup_direct_fixed called on non-direct-fixed SST");

            // Simple range check (no AMQF for direct-fixed format)
            let min_key = (direct_entry.min_key() as u64) << 32;
            let max_key = (direct_entry.max_key() as u64) << 32;
            if key_range_value < min_key || key_range_value > max_key {
                continue;
            }

            let result = direct_entry
                .sst(self)?
                .lookup_direct_fixed::<VALUE_SIZE>(key)?;
            if let Some(value) = result {
                return Ok(MetaLookupResult::SstLookup(SstLookupResult::Found(
                    LookupValue::Slice {
                        value: ArcSlice::from(value.to_vec().into_boxed_slice()),
                    },
                )));
            }
        }
        Ok(MetaLookupResult::RangeMiss)
    }

    /// Lookup for direct-key variable-value format.
    ///
    /// This is optimized for families with u32 integer keys but variable-size
    /// values stored in compressed blocks (e.g., TaskMeta, TaskData).
    ///
    /// The key is a u32 (e.g., TaskId). It will be rotated internally for lookup.
    /// Uses simple key range checks (no AMQF filter).
    pub fn lookup_direct_variable(
        &self,
        key_family: u32,
        key: u32,
        value_block_cache: &BlockCache,
    ) -> Result<MetaLookupResult> {
        if key_family != self.family {
            return Ok(MetaLookupResult::FamilyMiss);
        }

        // Convert key to range value for range checks
        let key_range_value = key_to_range_value(key);

        for entry in self.entries.iter().rev() {
            let direct_entry = entry
                .as_direct_variable()
                .expect("lookup_direct_variable called on non-direct-variable SST");

            // Simple range check (no AMQF for direct-variable format)
            let min_key = (direct_entry.min_key() as u64) << 32;
            let max_key = (direct_entry.max_key() as u64) << 32;
            if key_range_value < min_key || key_range_value > max_key {
                continue;
            }

            let result = direct_entry
                .sst(self)?
                .lookup_direct_variable(key, value_block_cache)?;
            if !matches!(result, SstLookupResult::NotFound) {
                return Ok(MetaLookupResult::SstLookup(result));
            }
        }
        Ok(MetaLookupResult::RangeMiss)
    }

    pub fn batch_lookup<K: QueryKey>(
        &self,
        key_family: u32,
        keys: &[K],
        cells: &mut [(u64, usize, Option<LookupValue>)],
        empty_cells: &mut usize,
        amqf_cache: &AmqfCache,
        key_block_cache: &BlockCache,
        value_block_cache: &BlockCache,
    ) -> Result<MetaBatchLookupResult> {
        if key_family != self.family {
            #[cfg(feature = "stats")]
            return Ok(MetaBatchLookupResult {
                family_miss: true,
                ..Default::default()
            });
            #[cfg(not(feature = "stats"))]
            return Ok(MetaBatchLookupResult {});
        }
        debug_assert!(
            cells.is_sorted_by_key(|(hash, _, _)| *hash),
            "Cells must be sorted by key hash"
        );
        #[allow(unused_mut, reason = "It's used when stats are enabled")]
        let mut lookup_result = MetaBatchLookupResult::default();
        for entry in self.entries.iter().rev() {
            // batch_lookup only works with hashed format entries
            let hashed_entry = entry
                .as_hashed()
                .expect("batch_lookup called on non-hashed entry");
            let min_hash = hashed_entry.min_hash();
            let max_hash = hashed_entry.max_hash();
            let start_index = cells
                .binary_search_by(|(hash, _, _)| hash.cmp(&min_hash).then(Ordering::Greater))
                .err()
                .unwrap();
            if start_index >= cells.len() {
                #[cfg(feature = "stats")]
                {
                    lookup_result.range_misses += 1;
                }
                continue;
            }
            let end_index = cells
                .binary_search_by(|(hash, _, _)| hash.cmp(&max_hash).then(Ordering::Less))
                .err()
                .unwrap()
                .checked_sub(1);
            let Some(end_index) = end_index else {
                #[cfg(feature = "stats")]
                {
                    lookup_result.range_misses += 1;
                }
                continue;
            };
            if start_index > end_index {
                #[cfg(feature = "stats")]
                {
                    lookup_result.range_misses += 1;
                }
                continue;
            }
            let amqf = hashed_entry.amqf(self, amqf_cache)?;
            for (hash, index, result) in &mut cells[start_index..=end_index] {
                if result.is_some() {
                    continue;
                }
                if !amqf.contains_fingerprint(*hash) {
                    #[cfg(feature = "stats")]
                    {
                        lookup_result.quick_filter_misses += 1;
                    }
                    continue;
                }
                let sst_result = hashed_entry.sst(self)?.lookup(
                    *hash,
                    &keys[*index],
                    key_block_cache,
                    value_block_cache,
                )?;
                if let SstLookupResult::Found(value) = sst_result {
                    *result = Some(value);
                    *empty_cells -= 1;
                    #[cfg(feature = "stats")]
                    {
                        lookup_result.hits += 1;
                    }
                    if *empty_cells == 0 {
                        return Ok(lookup_result);
                    }
                } else {
                    #[cfg(feature = "stats")]
                    {
                        lookup_result.sst_misses += 1;
                    }
                }
            }
        }
        Ok(lookup_result)
    }
}
