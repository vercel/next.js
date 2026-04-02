use std::{
    cmp::Ordering,
    fmt::Display,
    fs::File,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use anyhow::{Context, Result, bail};
use bitfield::bitfield;
use byteorder::{BE, ReadBytesExt};
use memmap2::{Mmap, MmapOptions};
use smallvec::SmallVec;
use zerocopy::{FromBytes, Immutable, IntoBytes, KnownLayout, Ref, big_endian as be};

use crate::{
    QueryKey,
    lookup_entry::LookupValue,
    mmap_helper::advise_mmap_for_persistence,
    static_sorted_file::{BlockCache, SstLookupResult, StaticSortedFile, StaticSortedFileMetaData},
};

bitfield! {
    #[derive(Clone, Copy, Default)]
    pub struct MetaEntryFlags(u32);
    impl Debug;
    impl From<u32>;
    /// The SST file was compacted and none of the entries have been accessed recently.
    pub cold, set_cold: 0;
    /// The SST file was freshly written and has not been compacted yet.
    pub fresh, set_fresh: 1;
}

impl MetaEntryFlags {
    pub const FRESH: MetaEntryFlags = MetaEntryFlags(0b10);
    pub const COLD: MetaEntryFlags = MetaEntryFlags(0b01);
    pub const WARM: MetaEntryFlags = MetaEntryFlags(0b00);
}

impl Display for MetaEntryFlags {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.fresh() {
            f.pad_integral(true, "", "fresh")
        } else if self.cold() {
            f.pad_integral(true, "", "cold")
        } else {
            f.pad_integral(true, "", "warm")
        }
    }
}

/// On-disk layout of a single entry header in the `.meta` file.
///
/// Fields are big-endian to match the existing wire format written by [`MetaFileBuilder`].
#[repr(C, packed)]
#[derive(FromBytes, IntoBytes, Immutable, KnownLayout, Clone, Copy)]
pub(crate) struct EntryHeader {
    sequence_number: be::U32,
    block_count: be::U16,
    min_hash: be::U64,
    max_hash: be::U64,
    size: be::U64,
    flags: be::U32,
    amqf_end_offset: be::U32,
}

impl EntryHeader {
    pub(crate) fn new(
        sequence_number: u32,
        block_count: u16,
        min_hash: u64,
        max_hash: u64,
        size: u64,
        flags: MetaEntryFlags,
        amqf_end_offset: u32,
    ) -> Self {
        Self {
            sequence_number: be::U32::new(sequence_number),
            block_count: be::U16::new(block_count),
            min_hash: be::U64::new(min_hash),
            max_hash: be::U64::new(max_hash),
            size: be::U64::new(size),
            flags: be::U32::new(flags.0),
            amqf_end_offset: be::U32::new(amqf_end_offset),
        }
    }
}

/// # Safety
///
/// `MetaEntry` stores a `FilterRef<'static>` with a transmuted lifetime that actually borrows
/// from the parent [`MetaFile`]'s mmap. This is safe because entries are only accessed by
/// reference through `MetaFile` and are never moved out.
///
/// For this reason this type should not implement Clone or Copy.
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
    /// The status flags for this entry.
    flags: MetaEntryFlags,
    /// Byte offset range of the raw AMQF data within the mmap, used for carrying forward
    /// serialized bytes during compaction without re-serializing.
    amqf_data_offset: std::ops::Range<u32>,
    /// The AMQF filter for this file, eagerly deserialized as a zero-copy [`qfilter::FilterRef`]
    /// that borrows directly from the parent [`MetaFile`]'s memory-mapped file.
    ///
    /// The `'static` lifetime is transmuted — the actual borrow is from `MetaFile::mmap`.
    amqf: qfilter::FilterRef<'static>,
    /// The static sorted file that is lazily loaded
    sst: OnceLock<StaticSortedFile>,
}

// Safety: FilterRef is a read-only view into the mmap which is Send+Sync.
unsafe impl Send for MetaEntry {}
unsafe impl Sync for MetaEntry {}

impl MetaEntry {
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
        self.amqf_data_offset.end - self.amqf_data_offset.start
    }

    /// Returns the raw serialized AMQF bytes from the mmap.
    pub fn raw_amqf<'l>(&self, amqf_data: &'l [u8]) -> &'l [u8] {
        &amqf_data[self.amqf_data_offset.start as usize..self.amqf_data_offset.end as usize]
    }

    fn sst(&self, meta: &MetaFile) -> Result<&StaticSortedFile> {
        self.sst.get_or_try_init(|| {
            StaticSortedFile::open(&meta.db_path, self.sst_data).with_context(|| {
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

    pub fn block_count(&self) -> u16 {
        self.sst_data.block_count
    }

    /// Returns the SST metadata needed to open the file independently.
    /// Used during compaction to avoid caching mmaps on the MetaEntry.
    pub fn sst_metadata(&self) -> StaticSortedFileMetaData {
        self.sst_data
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

/// # Safety
///
/// `entries` **must** be declared before `mmap` so that Rust's field drop order (declaration
/// order) drops all `FilterRef`s before the mmap is unmapped.  Reordering these fields would
/// be unsound.
pub struct MetaFile {
    /// The database path
    db_path: PathBuf,
    /// The sequence number of this file.
    sequence_number: u32,
    /// The key family of the SST files in this meta file.
    family: u32,
    /// The entries of the file. Dropped before `mmap` (field declaration order).
    entries: Vec<MetaEntry>,
    /// The entries that have been marked as obsolete.
    obsolete_entries: Vec<u32>,
    /// The obsolete SST files.
    obsolete_sst_files: Vec<u32>,
    /// Byte offset within the mmap where the AMQF data region starts (i.e. the header length).
    /// Entry AMQF offsets and used-keys offsets are relative to this position.
    amqf_data_start: u32,
    /// The offset of the start of the "used keys" AMQF data relative to the AMQF data region.
    start_of_used_keys_amqf_data_offset: u32,
    /// The offset of the end of the "used keys" AMQF data relative to the AMQF data region.
    end_of_used_keys_amqf_data_offset: u32,
    /// The memory mapped file.
    /// The entire memory-mapped file. Must be the last field that matters for drop order —
    /// `entries` contains `FilterRef`s that borrow from this mmap.
    mmap: Mmap,
}

impl MetaFile {
    /// Opens a meta file at the given path. Memory maps the entire file and eagerly deserializes
    /// all AMQF filters as zero-copy [`qfilter::FilterRef`]s that borrow from the mmap.
    pub fn open(db_path: &Path, sequence_number: u32) -> Result<Self> {
        let filename = format!("{sequence_number:08}.meta");
        let path = db_path.join(&filename);
        Self::open_internal(db_path.to_path_buf(), sequence_number, &path)
            .with_context(|| format!("Unable to open meta file {filename}"))
    }

    fn open_internal(db_path: PathBuf, sequence_number: u32, path: &Path) -> Result<Self> {
        let file = File::open(path).context("Failed to open meta file")?;
        let mmap = unsafe { MmapOptions::new().map(&file) }.context("Failed to mmap")?;
        #[cfg(unix)]
        mmap.advise(memmap2::Advice::Random)
            .context("Failed to advise mmap")?;
        advise_mmap_for_persistence(&mmap)?;
        // Parse the header from the mmap via ReadBytesExt on &[u8].
        let mut reader: &[u8] = &mmap;
        let magic = reader.read_u32::<BE>()?;
        if magic != 0xFE4ADA4A {
            bail!("Invalid magic number");
        }
        let family = reader.read_u32::<BE>()?;
        let obsolete_count = reader.read_u32::<BE>()?;
        let mut obsolete_sst_files = Vec::with_capacity(obsolete_count as usize);
        for _ in 0..obsolete_count {
            obsolete_sst_files.push(reader.read_u32::<BE>()?);
        }

        let count = reader.read_u32::<BE>()?;

        // Compute where the AMQF data region starts so we can deserialize filters inline.
        // Remaining header: count * ENTRY_HEADER_SIZE + used_keys_end_offset.
        let header_so_far = (mmap.len() - reader.len()) as u32;
        let amqf_data_start =
            header_so_far + count * (size_of::<EntryHeader>() as u32) + size_of::<u32>() as u32;
        let amqf_data = &mmap[amqf_data_start as usize..];

        // Parse entries and eagerly deserialize AMQF filters as zero-copy FilterRefs.
        let mut entries = Vec::with_capacity(count as usize);
        let mut start_of_amqf_data_offset: u32 = 0;
        for _ in 0..count {
            let (header, rest): (Ref<&[u8], EntryHeader>, _) = Ref::from_prefix(reader)
                .ok()
                .context("Entry header out of bounds")?;
            reader = rest;
            let sst_data = StaticSortedFileMetaData {
                sequence_number: header.sequence_number.get(),
                block_count: header.block_count.get(),
            };
            let min_hash = header.min_hash.get();
            let max_hash = header.max_hash.get();
            let size = header.size.get();
            let flags = MetaEntryFlags(header.flags.get());
            let end_of_amqf_data_offset = header.amqf_end_offset.get();

            let amqf_bytes = amqf_data
                .get(start_of_amqf_data_offset as usize..end_of_amqf_data_offset as usize)
                .expect("AMQF data out of bounds");
            // Deserialize the filter borrowing from the mmap, then erase the lifetime.
            let amqf: qfilter::FilterRef<'_> =
                postcard::from_bytes(amqf_bytes).with_context(|| {
                    format!(
                        "Failed to deserialize AMQF from {:08}.meta for {:08}.sst",
                        sequence_number, sst_data.sequence_number
                    )
                })?;
            // Safety: the mmap is kept alive by MetaFile and is dropped after entries (field
            // declaration order), so the borrow remains valid for the lifetime of the MetaEntry.
            let amqf: qfilter::FilterRef<'static> = unsafe { std::mem::transmute(amqf) };

            entries.push(MetaEntry {
                sst_data,
                family,
                min_hash,
                max_hash,
                size,
                flags,
                amqf_data_offset: start_of_amqf_data_offset..end_of_amqf_data_offset,
                amqf,
                sst: OnceLock::new(),
            });
            start_of_amqf_data_offset = end_of_amqf_data_offset;
        }

        let start_of_used_keys_amqf_data_offset = start_of_amqf_data_offset;
        let end_of_used_keys_amqf_data_offset = reader.read_u32::<BE>()?;

        Ok(Self {
            db_path,
            sequence_number,
            family,
            entries,
            obsolete_entries: Vec::new(),
            obsolete_sst_files,
            amqf_data_start,
            start_of_used_keys_amqf_data_offset,
            end_of_used_keys_amqf_data_offset,
            mmap,
        })
    }

    pub fn clear_cache(&mut self) {
        for entry in self.entries.iter_mut() {
            entry.sst.take();
        }
    }

    pub fn prepare_sst_cache(&self) {
        for entry in self.entries.iter() {
            let _ = entry.sst(self);
        }
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
        &self.mmap[self.amqf_data_start as usize..]
    }

    pub fn deserialize_used_key_hashes_amqf(&self) -> Result<Option<qfilter::FilterRef<'_>>> {
        if self.start_of_used_keys_amqf_data_offset == self.end_of_used_keys_amqf_data_offset {
            return Ok(None);
        }
        let amqf = &self.amqf_data()[self.start_of_used_keys_amqf_data_offset as usize
            ..self.end_of_used_keys_amqf_data_offset as usize];
        Ok(Some(postcard::from_bytes(amqf).with_context(|| {
            format!(
                "Failed to deserialize used key hashes AMQF from {:08}.meta",
                self.sequence_number
            )
        })?))
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

    /// Looks up a key in this meta file.
    ///
    /// If `FIND_ALL` is false, returns after finding the first match.
    /// If `FIND_ALL` is true, returns all entries with the same key from all SST files
    /// (useful for keyspaces where keys are hashes and collisions are possible).
    pub fn lookup<K: QueryKey, const FIND_ALL: bool>(
        &self,
        key_family: u32,
        key_hash: u64,
        key: &K,
        key_block_cache: &BlockCache,
        value_block_cache: &BlockCache,
    ) -> Result<MetaLookupResult> {
        if key_family != self.family {
            return Ok(MetaLookupResult::FamilyMiss);
        }
        let mut miss_result = MetaLookupResult::RangeMiss;
        let mut all_results: SmallVec<[LookupValue; 1]> = SmallVec::new();

        for entry in self.entries.iter().rev() {
            if key_hash < entry.min_hash || key_hash > entry.max_hash {
                continue;
            }
            if !entry.amqf.contains_fingerprint(key_hash) {
                miss_result = MetaLookupResult::QuickFilterMiss;
                continue;
            }

            let result = entry.sst(self)?.lookup::<K, FIND_ALL>(
                key_hash,
                key,
                key_block_cache,
                value_block_cache,
            )?;

            match result {
                SstLookupResult::NotFound => {
                    // continue searching other sst files
                }
                SstLookupResult::Found(values) => {
                    if !FIND_ALL {
                        // Return immediately with the first result
                        return Ok(MetaLookupResult::SstLookup(SstLookupResult::Found(values)));
                    }
                    // Check for tombstone — stops search across older SSTs within this meta file.
                    // Since tombstones sort last within a key group, if the last value is Deleted,
                    // we have a tombstone.
                    let has_tombstone = values.last().is_some_and(|v| *v == LookupValue::Deleted);
                    all_results.extend(values);
                    if has_tombstone {
                        return Ok(MetaLookupResult::SstLookup(SstLookupResult::Found(
                            all_results,
                        )));
                    }
                }
            }
        }

        if FIND_ALL && !all_results.is_empty() {
            return Ok(MetaLookupResult::SstLookup(SstLookupResult::Found(
                all_results,
            )));
        }

        Ok(miss_result)
    }

    pub fn batch_lookup<K: QueryKey>(
        &self,
        key_family: u32,
        keys: &[K],
        cells: &mut [(u64, usize, Option<LookupValue>)],
        empty_cells: &mut usize,
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
            let start_index = cells
                .binary_search_by(|(hash, _, _)| hash.cmp(&entry.min_hash).then(Ordering::Greater))
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
                .binary_search_by(|(hash, _, _)| hash.cmp(&entry.max_hash).then(Ordering::Less))
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
            for (hash, index, result) in &mut cells[start_index..=end_index] {
                debug_assert!(
                    *hash >= entry.min_hash && *hash <= entry.max_hash,
                    "Key hash out of range"
                );
                if result.is_some() {
                    continue;
                }
                if !entry.amqf.contains_fingerprint(*hash) {
                    #[cfg(feature = "stats")]
                    {
                        lookup_result.quick_filter_misses += 1;
                    }
                    continue;
                }
                let sst_result = entry.sst(self)?.lookup::<_, false>(
                    *hash,
                    &keys[*index],
                    key_block_cache,
                    value_block_cache,
                )?;
                if let SstLookupResult::Found(mut values) = sst_result {
                    // find_all=false guarantees exactly one result
                    debug_assert!(values.len() == 1);
                    let Some(value) = values.pop() else {
                        unreachable!()
                    };
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
