use std::{
    cmp::Ordering,
    fs::File,
    hash::BuildHasherDefault,
    ops::Range,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt};
use memmap2::Mmap;
use quick_cache::sync::GuardResult;
use rustc_hash::FxHasher;

use crate::{
    QueryKey,
    arc_bytes::ArcBytes,
    compression::decompress_into_arc,
    constants::MAX_INLINE_VALUE_SIZE,
    lookup_entry::{LazyLookupValue, LookupEntry, LookupValue},
};

/// The block header for an index block.
pub const BLOCK_TYPE_INDEX: u8 = 0;
/// The block header for a key block with 8-byte hash per entry.
pub const BLOCK_TYPE_KEY_WITH_HASH: u8 = 1;
/// The block header for a key block without hash.
pub const BLOCK_TYPE_KEY_NO_HASH: u8 = 2;

/// The tag for a small-sized value.
pub const KEY_BLOCK_ENTRY_TYPE_SMALL: u8 = 0;
/// The tag for the blob value.
pub const KEY_BLOCK_ENTRY_TYPE_BLOB: u8 = 1;
/// The tag for the deleted value.
pub const KEY_BLOCK_ENTRY_TYPE_DELETED: u8 = 2;
/// The tag for a medium-sized value.
pub const KEY_BLOCK_ENTRY_TYPE_MEDIUM: u8 = 3;
/// The minimum tag for inline values. The actual size is (tag - INLINE_MIN).
pub const KEY_BLOCK_ENTRY_TYPE_INLINE_MIN: u8 = 8;

// Static assertion: MAX_INLINE_VALUE_SIZE must fit in the key type encoding.
// Key types 8-255 encode inline values of size 0-247, so max is 255 - 8 = 247.
const _: () = assert!(
    MAX_INLINE_VALUE_SIZE <= (u8::MAX - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as usize,
    "MAX_INLINE_VALUE_SIZE exceeds what can be encoded in key type byte"
);

/// The result of a lookup operation.
pub enum SstLookupResult {
    /// The key was found.
    Found(LookupValue),
    /// The key was not found.
    NotFound,
}

impl From<LookupValue> for SstLookupResult {
    fn from(value: LookupValue) -> Self {
        SstLookupResult::Found(value)
    }
}

#[derive(Clone, Default)]
pub struct BlockWeighter;

impl quick_cache::Weighter<(u32, u16), ArcBytes> for BlockWeighter {
    fn weight(&self, _key: &(u32, u16), val: &ArcBytes) -> u64 {
        if val.is_mmap_backed() {
            // Mmap-backed blocks are cheap (just a pointer + Arc clone), so we
            // assign a small fixed weight. Caching them avoids re-parsing block
            // offsets on every lookup.
            64
        } else {
            val.len() as u64 + 8
        }
    }
}

pub type BlockCache =
    quick_cache::sync::Cache<(u32, u16), ArcBytes, BlockWeighter, BuildHasherDefault<FxHasher>>;

/// Trait abstracting value block caching for `handle_key_match`.
///
/// Implemented by `&BlockCache` (global shared cache for lookups) and
/// `&mut Option<(u16, ArcBytes)>` (lightweight single-entry cache for
/// sequential iteration).
trait ValueBlockCache {
    fn get_or_read(self, sst: &StaticSortedFile, block_index: u16) -> Result<ArcBytes>;
}

impl ValueBlockCache for &BlockCache {
    fn get_or_read(self, sst: &StaticSortedFile, block_index: u16) -> Result<ArcBytes> {
        let this = &sst;
        let block = match self.get_value_or_guard(&(this.meta.sequence_number, block_index), None) {
            GuardResult::Value(block) => block,
            GuardResult::Guard(guard) => {
                let block = this.read_small_value_block(block_index)?;
                let _ = guard.insert(block.clone());
                block
            }
            GuardResult::Timeout => unreachable!(),
        };
        Ok(block)
    }
}

impl ValueBlockCache for &mut Option<(u16, ArcBytes)> {
    fn get_or_read(self, sst: &StaticSortedFile, block_index: u16) -> Result<ArcBytes> {
        if let Some((idx, block)) = self.as_ref()
            && *idx == block_index
        {
            return Ok(block.clone());
        }
        let block = sst.read_small_value_block(block_index)?;
        *self = Some((block_index, block.clone()));
        Ok(block)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct StaticSortedFileMetaData {
    /// The sequence number of this file.
    pub sequence_number: u32,
    /// The length of the key compression dictionary.
    pub key_compression_dictionary_length: u16,
    /// The number of blocks in the SST file.
    pub block_count: u16,
}

impl StaticSortedFileMetaData {
    pub fn block_offsets_start(&self, sst_len: usize) -> usize {
        let bc: usize = self.block_count.into();
        sst_len - (bc * size_of::<u32>())
    }

    pub fn blocks_start(&self) -> usize {
        let k: usize = self.key_compression_dictionary_length.into();
        k
    }

    pub fn key_compression_dictionary_range(&self) -> Range<usize> {
        let start = 0;
        let end: usize = self.key_compression_dictionary_length.into();
        start..end
    }
}

/// A memory mapped SST file.
pub struct StaticSortedFile {
    /// The meta file of this file.
    meta: StaticSortedFileMetaData,
    /// The memory mapped file.
    /// We store as an Arc so we can hand out references (via ArcBytes) that can outlive this
    /// struct (not that we expect them to outlive it by very much)
    mmap: Arc<Mmap>,
}

impl StaticSortedFile {
    /// Opens an SST file at the given path. This memory maps the file, but does not read it yet.
    /// It's lazy read on demand.
    pub fn open(db_path: &Path, meta: StaticSortedFileMetaData) -> Result<Self> {
        let filename = format!("{:08}.sst", meta.sequence_number);
        let path = db_path.join(&filename);
        Self::open_internal(path, meta, false)
            .with_context(|| format!("Unable to open static sorted file {filename}"))
    }

    /// Opens an SST file for compaction. Uses MADV_SEQUENTIAL instead of MADV_RANDOM,
    /// since compaction reads blocks sequentially and benefits from OS read-ahead
    /// and page reclamation.
    pub fn open_for_compaction(db_path: &Path, meta: StaticSortedFileMetaData) -> Result<Self> {
        let filename = format!("{:08}.sst", meta.sequence_number);
        let path = db_path.join(&filename);
        Self::open_internal(path, meta, true)
            .with_context(|| format!("Unable to open static sorted file {filename}"))
    }

    fn open_internal(
        path: PathBuf,
        meta: StaticSortedFileMetaData,
        sequential: bool,
    ) -> Result<Self> {
        let mmap = unsafe { Mmap::map(&File::open(&path)?)? };
        #[cfg(unix)]
        if sequential {
            mmap.advise(memmap2::Advice::Sequential)?;
        } else {
            mmap.advise(memmap2::Advice::Random)?;
            let offset = meta.block_offsets_start(mmap.len());
            let _ = mmap.advise_range(memmap2::Advice::Sequential, offset, mmap.len() - offset);
        }
        let file = Self {
            meta,
            mmap: Arc::new(mmap),
        };
        Ok(file)
    }

    /// Consume this file and return an iterator over all entries in sorted order.
    /// The iterator takes ownership of the SST file, so the mmap and its pages
    /// are freed when the iterator is dropped.
    pub fn try_into_iter(self) -> Result<StaticSortedFileIter> {
        let block_count = self.meta.block_count;
        let mut iter = StaticSortedFileIter {
            this: self,
            stack: Vec::new(),
            current_key_block: None,
            value_block_cache: None,
        };
        iter.enter_block(block_count - 1)?;
        Ok(iter)
    }

    /// Looks up a key in this file.
    pub fn lookup<K: QueryKey>(
        &self,
        key_hash: u64,
        key: &K,
        key_block_cache: &BlockCache,
        value_block_cache: &BlockCache,
    ) -> Result<SstLookupResult> {
        let mut current_block = self.meta.block_count - 1;
        loop {
            let mut key_block_arc = self.get_key_block(current_block, key_block_cache)?;
            let block_type = key_block_arc.read_u8()?;
            match block_type {
                BLOCK_TYPE_INDEX => {
                    current_block = self.lookup_index_block(&key_block_arc, key_hash)?;
                }
                BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => {
                    let has_hash = block_type == BLOCK_TYPE_KEY_WITH_HASH;
                    return self.lookup_key_block(
                        key_block_arc,
                        key_hash,
                        key,
                        has_hash,
                        value_block_cache,
                    );
                }
                _ => {
                    bail!("Invalid block type");
                }
            }
        }
    }

    /// Looks up a hash in a index block.
    fn lookup_index_block(&self, mut block: &[u8], hash: u64) -> Result<u16> {
        let first_block = block.read_u16::<BE>()?;
        let entry_count = block.len() / 10;
        if entry_count == 0 {
            return Ok(first_block);
        }
        let entries = block;
        fn get_hash(entries: &[u8], index: usize) -> Result<u64> {
            Ok((&entries[index * 10..]).read_u64::<BE>()?)
        }
        fn get_block(entries: &[u8], index: usize) -> Result<u16> {
            Ok((&entries[index * 10 + 8..]).read_u16::<BE>()?)
        }
        let first_hash = get_hash(entries, 0)?;
        match hash.cmp(&first_hash) {
            Ordering::Less => {
                return Ok(first_block);
            }
            Ordering::Equal => {
                return get_block(entries, 0);
            }
            Ordering::Greater => {}
        }

        let mut l = 1;
        let mut r = entry_count;
        // binary search for the range
        while l < r {
            let m = (l + r) / 2;
            let mid_hash = get_hash(entries, m)?;
            match hash.cmp(&mid_hash) {
                Ordering::Less => {
                    r = m;
                }
                Ordering::Equal => {
                    return get_block(entries, m);
                }
                Ordering::Greater => {
                    l = m + 1;
                }
            }
        }
        get_block(entries, l - 1)
    }

    /// Looks up a key in a key block and the value in a value block.
    fn lookup_key_block<K: QueryKey>(
        &self,
        mut block: ArcBytes,
        key_hash: u64,
        key: &K,
        has_hash: bool,
        value_block_cache: &BlockCache,
    ) -> Result<SstLookupResult> {
        let hash_len: u8 = if has_hash { 8 } else { 0 };
        let entry_count = block.read_u24::<BE>()? as usize;
        let offsets = &block[..entry_count * 4];
        let entries = &block[entry_count * 4..];

        let mut l = 0;
        let mut r = entry_count;
        // binary search for the key
        while l < r {
            let m = (l + r) / 2;
            let GetKeyEntryResult {
                hash: mid_hash,
                key: mid_key,
                ty,
                val: mid_val,
            } = get_key_entry(offsets, entries, entry_count, m, hash_len)?;

            let comparison = compare_hash_key(mid_hash, mid_key, key_hash, key);

            match comparison {
                Ordering::Less => {
                    r = m;
                }
                Ordering::Equal => {
                    return Ok(self
                        .handle_key_match(ty, mid_val, &block, value_block_cache)?
                        .into());
                }
                Ordering::Greater => {
                    l = m + 1;
                }
            }
        }
        Ok(SstLookupResult::NotFound)
    }

    /// Handles a key match by looking up the value.
    fn handle_key_match(
        &self,
        ty: u8,
        mut val: &[u8],
        key_block_arc: &ArcBytes,
        value_block_cache: impl ValueBlockCache,
    ) -> Result<LookupValue> {
        Ok(match ty {
            KEY_BLOCK_ENTRY_TYPE_SMALL => {
                let block = val.read_u16::<BE>()?;
                let size = val.read_u16::<BE>()? as usize;
                let position = val.read_u32::<BE>()? as usize;
                let value = value_block_cache
                    .get_or_read(self, block)?
                    .slice(position..position + size);
                LookupValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
                let block = val.read_u16::<BE>()?;
                let value = self.read_value_block(block)?;
                LookupValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_BLOB => {
                let sequence_number = val.read_u32::<BE>()?;
                LookupValue::Blob { sequence_number }
            }
            KEY_BLOCK_ENTRY_TYPE_DELETED => LookupValue::Deleted,
            _ => {
                // Inline value — val is already the correct slice
                // SAFETY: val points into key_block_arc's data
                let value = unsafe { key_block_arc.slice_from_subslice(val) };
                LookupValue::Slice { value }
            }
        })
    }

    /// Gets a key block from the cache or reads it from the file.
    fn get_key_block(
        &self,
        block: u16,
        key_block_cache: &BlockCache,
    ) -> Result<ArcBytes, anyhow::Error> {
        Ok(
            match key_block_cache.get_value_or_guard(&(self.meta.sequence_number, block), None) {
                GuardResult::Value(block) => block,
                GuardResult::Guard(guard) => {
                    let block = self.read_key_block(block)?;
                    let _ = guard.insert(block.clone());
                    block
                }
                GuardResult::Timeout => unreachable!(),
            },
        )
    }

    /// Reads a key block from the file.
    fn read_key_block(&self, block_index: u16) -> Result<ArcBytes> {
        self.read_block(
            block_index,
            Some(&self.mmap[self.meta.key_compression_dictionary_range()]),
            false,
        )
    }

    /// Reads a value block from the file.
    fn read_small_value_block(&self, block_index: u16) -> Result<ArcBytes> {
        self.read_block(block_index, None, false)
    }

    /// Reads a value block from the file.
    fn read_value_block(&self, block_index: u16) -> Result<ArcBytes> {
        self.read_block(block_index, None, true)
    }

    /// Reads a block from the file.
    #[tracing::instrument(level = "info", name = "reading database block", skip_all)]
    fn read_block(
        &self,
        block_index: u16,
        compression_dictionary: Option<&[u8]>,
        long_term: bool,
    ) -> Result<ArcBytes> {
        let (uncompressed_length, block) = self.get_raw_block_slice(block_index)?;

        // 0 means the block was not compressed, return the mmap-backed ArcBytes directly
        if uncompressed_length == 0 {
            return Ok(self.mmap_slice_to_arc_bytes(block));
        }

        // Advise Sequential only here: we're about to linearly scan the block
        // through the decompressor. For uncompressed blocks (returned above)
        // and lazy medium values (which call get_raw_block directly without
        // decompressing), the file-level Random advice applies.
        #[cfg(unix)]
        let _ = self.mmap.advise_range(
            memmap2::Advice::Sequential,
            block.as_ptr() as usize - self.mmap.as_ptr() as usize,
            block.len(),
        );

        let buffer = decompress_into_arc(
            uncompressed_length,
            block,
            compression_dictionary,
            long_term,
        )?;
        Ok(ArcBytes::from(buffer))
    }

    /// Returns `(uncompressed_length, block_data)` as an owned `ArcBytes` backed by
    /// the mmap. Only use this when the block data needs to outlive the current borrow
    /// (e.g. medium values stored in `LookupEntry`).
    fn get_raw_block(&self, block_index: u16) -> Result<(u32, ArcBytes)> {
        let (uncompressed_length, block) = self.get_raw_block_slice(block_index)?;
        Ok((uncompressed_length, self.mmap_slice_to_arc_bytes(block)))
    }

    /// Promotes a mmap subslice to an owned `ArcBytes`. This clones the `Arc<Mmap>`.
    fn mmap_slice_to_arc_bytes(&self, subslice: &[u8]) -> ArcBytes {
        // SAFETY: callers guarantee subslice points into self.mmap.
        unsafe { ArcBytes::from_mmap(self.mmap.clone(), subslice) }
    }

    /// Gets the raw block slice directly from the memory mapped file, without
    /// cloning the `Arc<Mmap>`. The returned slice borrows from the mmap.
    fn get_raw_block_slice(&self, block_index: u16) -> Result<(u32, &[u8])> {
        #[cfg(feature = "strict_checks")]
        if block_index >= self.meta.block_count {
            bail!(
                "Corrupted file seq:{} block:{} > number of blocks {} (block_offsets: {:x}, \
                 blocks: {:x})",
                self.meta.sequence_number,
                block_index,
                self.meta.block_count,
                self.meta.block_offsets_start(self.mmap.len()),
                self.meta.blocks_start()
            );
        }
        let offset = self.meta.block_offsets_start(self.mmap.len()) + block_index as usize * 4;
        #[cfg(feature = "strict_checks")]
        if offset + 4 > self.mmap.len() {
            bail!(
                "Corrupted file seq:{} block:{} block offset locations {} + 4 bytes > file end {} \
                 (block_offsets: {:x}, blocks: {:x})",
                self.meta.sequence_number,
                block_index,
                offset,
                self.mmap.len(),
                self.meta.block_offsets_start(self.mmap.len()),
                self.meta.blocks_start()
            );
        }
        let block_start = if block_index == 0 {
            self.meta.blocks_start()
        } else {
            self.meta.blocks_start() + (&self.mmap[offset - 4..offset]).read_u32::<BE>()? as usize
        };
        let block_end =
            self.meta.blocks_start() + (&self.mmap[offset..offset + 4]).read_u32::<BE>()? as usize;
        #[cfg(feature = "strict_checks")]
        if block_end > self.mmap.len() || block_start > self.mmap.len() {
            bail!(
                "Corrupted file seq:{} block:{} block {} - {} > file end {} (block_offsets: {:x}, \
                 blocks: {:x})",
                self.meta.sequence_number,
                block_index,
                block_start,
                block_end,
                self.mmap.len(),
                self.meta.block_offsets_start(self.mmap.len()),
                self.meta.blocks_start()
            );
        }
        let uncompressed_length =
            u32::from_be_bytes(self.mmap[block_start..block_start + 4].try_into()?);
        let block = &self.mmap[block_start + 4..block_end];
        Ok((uncompressed_length, block))
    }
}

/// An iterator over all entries in a SST file in sorted order.
pub struct StaticSortedFileIter {
    this: StaticSortedFile,

    stack: Vec<CurrentIndexBlock>,
    current_key_block: Option<CurrentKeyBlock>,
    /// Single-entry value block cache. Within a key block, entries reference
    /// value blocks sequentially and don't revisit earlier blocks, so caching
    /// just the current one avoids redundant decompression.
    value_block_cache: Option<(u16, ArcBytes)>,
}

struct CurrentKeyBlock {
    offsets: ArcBytes,
    entries: ArcBytes,
    entry_count: usize,
    index: usize,
    hash_len: u8,
}

struct CurrentIndexBlock {
    entries: ArcBytes,
    block_indices_count: usize,
    index: usize,
}

impl Iterator for StaticSortedFileIter {
    type Item = Result<LookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        self.next_internal().transpose()
    }
}

impl StaticSortedFileIter {
    /// Enters a block at the given index.
    fn enter_block(&mut self, block_index: u16) -> Result<()> {
        let block_arc = self.this.read_key_block(block_index)?;
        let mut block = &*block_arc;
        let block_type = block.read_u8()?;
        match block_type {
            BLOCK_TYPE_INDEX => {
                let block_indices_count = (block.len() + 8) / 10;
                let range = 1..block_arc.len();
                self.stack.push(CurrentIndexBlock {
                    entries: block_arc.slice(range),
                    block_indices_count,
                    index: 0,
                });
            }
            BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => {
                let has_hash = block_type == BLOCK_TYPE_KEY_WITH_HASH;
                let hash_len = if has_hash { 8 } else { 0 };
                let entry_count = block.read_u24::<BE>()? as usize;
                let offsets_range = 4..4 + entry_count * 4;
                let entries_range = 4 + entry_count * 4..block_arc.len();
                let offsets = block_arc.clone().slice(offsets_range);
                let entries = block_arc.slice(entries_range);
                self.current_key_block = Some(CurrentKeyBlock {
                    offsets,
                    entries,
                    entry_count,
                    index: 0,
                    hash_len,
                });
            }
            _ => {
                bail!("Invalid block type");
            }
        }
        Ok(())
    }

    /// Gets the next entry in the file and moves the cursor.
    fn next_internal(&mut self) -> Result<Option<LookupEntry>> {
        loop {
            if let Some(CurrentKeyBlock {
                offsets,
                entries,
                entry_count,
                index,
                hash_len,
            }) = self.current_key_block.take()
            {
                let GetKeyEntryResult { hash, key, ty, val } =
                    get_key_entry(&offsets, &entries, entry_count, index, hash_len)?;
                // Convert hash slice to u64, computing from key if no hash stored
                let full_hash = if hash.is_empty() {
                    crate::key::hash_key(&key)
                } else {
                    u64::from_be_bytes(hash.try_into().unwrap())
                };
                let value = if ty == KEY_BLOCK_ENTRY_TYPE_MEDIUM {
                    let mut val = val;
                    let block = val.read_u16::<BE>()?;
                    let (uncompressed_size, block) = self.this.get_raw_block(block)?;
                    LazyLookupValue::Medium {
                        uncompressed_size,
                        block,
                    }
                } else {
                    let value = self.this.handle_key_match(
                        ty,
                        val,
                        &entries,
                        &mut self.value_block_cache,
                    )?;
                    LazyLookupValue::Eager(value)
                };
                let entry = LookupEntry {
                    hash: full_hash,
                    // SAFETY: key points into entries which is backed by the same Arc
                    key: unsafe { entries.slice_from_subslice(key) },
                    value,
                };
                if index + 1 < entry_count {
                    self.current_key_block = Some(CurrentKeyBlock {
                        offsets,
                        entries,
                        entry_count,
                        index: index + 1,
                        hash_len,
                    });
                }
                return Ok(Some(entry));
            }
            if let Some(CurrentIndexBlock {
                entries,
                block_indices_count,
                index,
            }) = self.stack.pop()
            {
                let block_index = (&entries[index * 10..]).read_u16::<BE>()?;
                if index + 1 < block_indices_count {
                    self.stack.push(CurrentIndexBlock {
                        entries,
                        block_indices_count,
                        index: index + 1,
                    });
                }
                self.enter_block(block_index)?;
            } else {
                return Ok(None);
            }
        }
    }
}

struct GetKeyEntryResult<'l> {
    hash: &'l [u8],
    key: &'l [u8],
    ty: u8,
    val: &'l [u8],
}

/// Compares a query (full_hash + query_key) against an entry (entry_hash + entry_key).
/// Returns the ordering of query relative to entry.
/// When entry_hash is empty, computes full hash from entry_key.
fn compare_hash_key<K: QueryKey>(
    entry_hash: &[u8],
    entry_key: &[u8],
    full_hash: u64,
    query_key: &K,
) -> Ordering {
    if entry_hash.is_empty() {
        // No hash stored - compute full hash from entry key
        let entry_full_hash = crate::key::hash_key(&entry_key);
        match full_hash.cmp(&entry_full_hash) {
            Ordering::Equal => query_key.cmp(entry_key),
            ord => ord,
        }
    } else {
        // Full 8-byte hash stored - compare hashes first
        let full_hash_bytes = full_hash.to_be_bytes();
        match full_hash_bytes[..].cmp(entry_hash) {
            Ordering::Equal => query_key.cmp(entry_key),
            ord => ord,
        }
    }
}

/// Returns the byte size of the value portion for a given key block entry type.
fn entry_val_size(ty: u8) -> Result<usize> {
    match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => Ok(8), // 2 bytes block index, 2 bytes size, 4 bytes position
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => Ok(2), // 2 bytes block index
        KEY_BLOCK_ENTRY_TYPE_BLOB => Ok(4),  // 4 byte blob id
        KEY_BLOCK_ENTRY_TYPE_DELETED => Ok(0), // no value
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
            Ok((ty - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as usize)
        }
        _ => bail!("Invalid key block entry type"),
    }
}

/// Reads a key entry from a key block.
fn get_key_entry<'l>(
    offsets: &[u8],
    entries: &'l [u8],
    entry_count: usize,
    index: usize,
    hash_len: u8,
) -> Result<GetKeyEntryResult<'l>> {
    let hash_len_usize = hash_len as usize;
    let mut offset = &offsets[index * 4..];
    let ty = offset.read_u8()?;
    let start = offset.read_u24::<BE>()? as usize;
    let end = if index == entry_count - 1 {
        entries.len()
    } else {
        (&offsets[(index + 1) * 4 + 1..]).read_u24::<BE>()? as usize
    };
    // Return the raw hash bytes slice (0-8 bytes depending on hash_len)
    let hash = &entries[start..start + hash_len_usize];
    let val_size = entry_val_size(ty)?;
    Ok(GetKeyEntryResult {
        hash,
        key: &entries[start + hash_len_usize..end - val_size],
        ty,
        val: &entries[end - val_size..end],
    })
}
