use std::{cmp::Ordering, fs::File, hash::BuildHasherDefault, path::Path, rc::Rc, sync::Arc};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt};
use memmap2::Mmap;
use quick_cache::sync::GuardResult;
use rustc_hash::FxHasher;
use smallvec::SmallVec;

use crate::{
    QueryKey,
    arc_bytes::ArcBytes,
    compression::{checksum_block, decompress_into_arc},
    constants::MAX_INLINE_VALUE_SIZE,
    lookup_entry::{IterValue, LookupEntry, LookupValue},
    mmap_helper::advise_mmap_for_persistence,
    rc_bytes::RcBytes,
    static_sorted_file_builder::BLOCK_HEADER_SIZE,
};

/// The block header for an index block.
pub const BLOCK_TYPE_INDEX: u8 = 0;
/// The block header for a key block with 8-byte hash per entry.
pub const BLOCK_TYPE_KEY_WITH_HASH: u8 = 1;
/// The block header for a key block without hash.
pub const BLOCK_TYPE_KEY_NO_HASH: u8 = 2;
/// The block header for a fixed-size key block with 8-byte hash per entry.
pub const BLOCK_TYPE_FIXED_KEY_WITH_HASH: u8 = 3;
/// The block header for a fixed-size key block without hash.
pub const BLOCK_TYPE_FIXED_KEY_NO_HASH: u8 = 4;

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

/// Encoded size of a small value reference: 2B block index + 2B size + 4B offset.
pub(crate) const SMALL_VALUE_REF_SIZE: usize = 8;
/// Encoded size of a medium value reference: 2B block index.
pub(crate) const MEDIUM_VALUE_REF_SIZE: usize = 2;
/// Encoded size of a blob value reference: 4B blob id.
pub(crate) const BLOB_VALUE_REF_SIZE: usize = 4;
/// Encoded size of a deleted (tombstone) value reference.
pub(crate) const DELETED_VALUE_REF_SIZE: usize = 0;

// Static assertion: MAX_INLINE_VALUE_SIZE must fit in the key type encoding.
// Key types 8-255 encode inline values of size 0-247, so max is 255 - 8 = 247.
const _: () = assert!(
    MAX_INLINE_VALUE_SIZE <= (u8::MAX - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as usize,
    "MAX_INLINE_VALUE_SIZE exceeds what can be encoded in key type byte"
);

/// The result of a lookup operation.
pub enum SstLookupResult {
    /// One or more values were found.
    Found(SmallVec<[LookupValue; 1]>),
    /// The key was not found.
    NotFound,
}

impl From<LookupValue> for SstLookupResult {
    fn from(value: LookupValue) -> Self {
        SstLookupResult::Found(smallvec::smallvec![value])
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
    /// The number of blocks in the SST file.
    pub block_count: u16,
}

impl StaticSortedFileMetaData {
    pub fn block_offsets_start(&self, sst_len: usize) -> usize {
        let bc: usize = self.block_count.into();
        sst_len - (bc * size_of::<u32>())
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
        let file = File::open(&path)
            .with_context(|| format!("Failed to open SST file {}", path.display()))?;
        let mmap = unsafe { Mmap::map(&file) }.with_context(|| {
            format!(
                "Failed to mmap SST file {} ({} bytes)",
                path.display(),
                file.metadata().map(|m| m.len()).unwrap_or(0)
            )
        })?;
        #[cfg(unix)]
        {
            mmap.advise(memmap2::Advice::Random)?;
            let offset = meta.block_offsets_start(mmap.len());
            let _ = mmap.advise_range(memmap2::Advice::Sequential, offset, mmap.len() - offset);
        }
        advise_mmap_for_persistence(&mmap)?;
        Ok(Self {
            meta,
            mmap: Arc::new(mmap),
        })
    }

    /// Looks up a key in this file.
    ///
    /// If `FIND_ALL` is false, returns after finding the first match.
    /// If `FIND_ALL` is true, returns all entries with the same key (useful for
    /// keyspaces where keys are hashes and collisions are possible).
    pub fn lookup<K: QueryKey, const FIND_ALL: bool>(
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
                    return self.lookup_key_block::<K, FIND_ALL>(
                        key_block_arc,
                        key_hash,
                        key,
                        has_hash,
                        value_block_cache,
                    );
                }
                BLOCK_TYPE_FIXED_KEY_WITH_HASH | BLOCK_TYPE_FIXED_KEY_NO_HASH => {
                    let has_hash = block_type == BLOCK_TYPE_FIXED_KEY_WITH_HASH;
                    return self.lookup_fixed_key_block::<K, FIND_ALL>(
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
        // Each entry is 10 bytes: 8 bytes for the hash, 2 bytes for the block index
        let (entries, remainder) = block.as_chunks::<10>();
        if entries.is_empty() {
            return Ok(first_block);
        }
        if !remainder.is_empty() {
            bail!("invalid index block, {} extra bytes", remainder.len())
        }
        match entries.binary_search_by(|entry| (&entry[..]).read_u64::<BE>().unwrap().cmp(&hash)) {
            Ok(i) => Ok((&entries[i][8..]).read_u16::<BE>()?),
            Err(0) => Ok(first_block),
            Err(i) => Ok((&entries[i - 1][8..]).read_u16::<BE>()?),
        }
    }

    /// Looks up a key in a key block and the value in a value block.
    ///
    /// If `FIND_ALL` is false, returns after finding the first match.
    /// If `FIND_ALL` is true, collects all entries with the same key.
    fn lookup_key_block<K: QueryKey, const FIND_ALL: bool>(
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

        self.lookup_block_inner::<K, FIND_ALL>(
            &block,
            entry_count,
            key_hash,
            key,
            value_block_cache,
            |i| get_key_entry(offsets, entries, entry_count, i, hash_len),
        )
    }

    /// Looks up a key in a fixed-size key block.
    ///
    /// Fixed-size key blocks store entries at predictable offsets (no offset table),
    /// enabling direct indexing during binary search.
    fn lookup_fixed_key_block<K: QueryKey, const FIND_ALL: bool>(
        &self,
        mut block: ArcBytes,
        key_hash: u64,
        key: &K,
        has_hash: bool,
        value_block_cache: &BlockCache,
    ) -> Result<SstLookupResult> {
        let hash_len: u8 = if has_hash { 8 } else { 0 };
        let entry_count = block.read_u24::<BE>()? as usize;
        let key_size = block.read_u8()? as usize;
        let value_type = block.read_u8()?;
        let val_size = entry_val_size(value_type)?;
        let stride = hash_len as usize + key_size + val_size;
        let entries = &block[..];

        self.lookup_block_inner::<K, FIND_ALL>(
            &block,
            entry_count,
            key_hash,
            key,
            value_block_cache,
            |i| {
                Ok(get_fixed_key_entry(
                    entries, i, hash_len, key_size, value_type, stride,
                ))
            },
        )
    }

    /// Shared binary search + collection logic for both key block variants.
    ///
    /// The `get_entry` closure abstracts over the difference between variable-size
    /// key blocks (offset table lookup) and fixed-size key blocks (stride-based indexing).
    fn lookup_block_inner<'a, K: QueryKey, const FIND_ALL: bool>(
        &self,
        block: &ArcBytes,
        entry_count: usize,
        key_hash: u64,
        key: &K,
        value_block_cache: &BlockCache,
        get_entry: impl Fn(usize) -> Result<GetKeyEntryResult<'a>>,
    ) -> Result<SstLookupResult> {
        let mut l = 0;
        let mut r = entry_count;
        // binary search for a matching key
        while l < r {
            let m = (l + r) / 2;
            let GetKeyEntryResult {
                hash: mid_hash,
                key: mid_key,
                ty,
                val,
            } = get_entry(m)?;

            let comparison = compare_hash_key(mid_hash, mid_key, key_hash, key);

            match comparison {
                Ordering::Less => r = m,
                Ordering::Equal => {
                    if !FIND_ALL {
                        // SingleValue mode: each key has exactly one entry
                        // this is enforced when writing
                        let result = self.handle_key_match(ty, val, block, value_block_cache)?;
                        return Ok(SstLookupResult::Found(SmallVec::from_buf([result])));
                    }
                    // FIND_ALL (MultiValue) mode: collect all values for this key.
                    // Tombstones (Deleted) sort last within each key group, so we
                    // scan backward to find the start of the key group, then forward
                    // to collect all entries. The tombstone, if present, will be the
                    // last entry in the results.
                    let mut results = SmallVec::new();
                    for i in (l..m).rev() {
                        let GetKeyEntryResult {
                            hash,
                            key: entry_key,
                            ty,
                            val,
                        } = get_entry(i)?;
                        if !entry_matches_key(hash, entry_key, key_hash, key) {
                            break;
                        }
                        results.push(self.handle_key_match(ty, val, block, value_block_cache)?);
                    }
                    // Technically we could `.reverse()` the items collected by the backwards
                    // scan, but the only ordering constraint we need to maintain for single
                    // sst multivalue reads is that a deleted token, if it exists comes last.
                    // Because all the backwards scan items are strictly before the found item
                    // we know they don't contain the _last_ item. So we don't care about
                    // their order.

                    // Add the entry at `m`
                    results.push(self.handle_key_match(ty, val, block, value_block_cache)?);
                    for i in (m + 1)..r {
                        let GetKeyEntryResult {
                            hash,
                            key: entry_key,
                            ty,
                            val,
                        } = get_entry(i)?;
                        if !entry_matches_key(hash, entry_key, key_hash, key) {
                            break;
                        }
                        results.push(self.handle_key_match(ty, val, block, value_block_cache)?);
                    }
                    return Ok(SstLookupResult::Found(results));
                }
                Ordering::Greater => l = m + 1,
            }
        }

        Ok(SstLookupResult::NotFound)
    }

    /// Handles a key match by looking up the value.
    fn handle_key_match(
        &self,
        ty: u8,
        val: &[u8],
        key_block_arc: &ArcBytes,
        value_block_cache: impl ValueBlockCache,
    ) -> Result<LookupValue> {
        Ok(match ty {
            KEY_BLOCK_ENTRY_TYPE_SMALL => {
                let block = u16::from_be_bytes(val[0..2].try_into().unwrap());
                let size = u16::from_be_bytes(val[2..4].try_into().unwrap()) as usize;
                let position = u32::from_be_bytes(val[4..8].try_into().unwrap()) as usize;
                let value = value_block_cache
                    .get_or_read(self, block)?
                    .slice(position..position + size);
                LookupValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
                let block = u16::from_be_bytes(val[0..2].try_into().unwrap());
                let value = self.read_value_block(block)?;
                LookupValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_BLOB => {
                let sequence_number = u32::from_be_bytes(val[0..4].try_into().unwrap());
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
        self.read_block(block_index)
    }

    /// Reads a small value block from the file.
    fn read_small_value_block(&self, block_index: u16) -> Result<ArcBytes> {
        self.read_block(block_index)
    }

    /// Reads a value block from the file.
    fn read_value_block(&self, block_index: u16) -> Result<ArcBytes> {
        self.read_block(block_index)
    }

    /// Reads a block from the file, decompressing if needed, and verifies its checksum.
    ///
    /// The checksum is verified on the raw on-disk data **before** decompression, so
    /// corruption is caught before passing data to LZ4.
    #[tracing::instrument(level = "info", name = "reading database block", skip_all)]
    fn read_block(&self, block_index: u16) -> Result<ArcBytes> {
        let (uncompressed_length, expected_checksum, block) =
            get_raw_block_slice(&self.mmap, &self.meta, block_index).with_context(|| {
                format!(
                    "Failed to read raw block {} from {:08}.sst",
                    block_index, self.meta.sequence_number
                )
            })?;

        // Verify checksum on the raw on-disk data before decompression.
        verify_checksum(&self.meta, block, expected_checksum, block_index)?;

        // 0 means the block was not compressed, return the mmap-backed ArcBytes directly
        if uncompressed_length == 0 {
            // SAFETY: callers guarantee block points into self.mmap.
            return Ok(unsafe { ArcBytes::from_mmap(self.mmap.clone(), block) });
        }

        let buffer = decompress_into_arc(uncompressed_length, block).with_context(|| {
            format!(
                "Failed to decompress block {} from {:08}.sst ({} bytes uncompressed)",
                block_index, self.meta.sequence_number, uncompressed_length
            )
        })?;
        Ok(ArcBytes::from(buffer))
    }
}

/// Gets the raw block slice directly from a memory-mapped file.
/// Returns `(uncompressed_length, checksum, block_data)`.
fn get_raw_block_slice<'a>(
    mmap: &'a Mmap,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
) -> Result<(u32, u32, &'a [u8])> {
    #[cfg(feature = "strict_checks")]
    if block_index >= meta.block_count {
        bail!(
            "Corrupted file seq:{} block:{} > number of blocks {} (block_offsets: {:x})",
            meta.sequence_number,
            block_index,
            meta.block_count,
            meta.block_offsets_start(mmap.len()),
        );
    }
    let offset = meta.block_offsets_start(mmap.len()) + block_index as usize * 4;
    #[cfg(feature = "strict_checks")]
    if offset + 4 > mmap.len() {
        bail!(
            "Corrupted file seq:{} block:{} block offset locations {} + 4 bytes > file end {} \
             (block_offsets: {:x})",
            meta.sequence_number,
            block_index,
            offset,
            mmap.len(),
            meta.block_offsets_start(mmap.len()),
        );
    }
    let block_start = if block_index == 0 {
        0
    } else {
        (&mmap[offset - 4..offset])
            .read_u32::<BE>()
            .with_context(|| {
                format!(
                    "Failed to read block_start offset for block {} in {:08}.sst",
                    block_index, meta.sequence_number
                )
            })? as usize
    };
    let block_end = (&mmap[offset..offset + 4])
        .read_u32::<BE>()
        .with_context(|| {
            format!(
                "Failed to read block_end offset for block {} in {:08}.sst",
                block_index, meta.sequence_number
            )
        })? as usize;
    #[cfg(feature = "strict_checks")]
    if block_end > mmap.len() || block_start > mmap.len() {
        bail!(
            "Corrupted file seq:{} block:{} block {} - {} > file end {} (block_offsets: {:x})",
            meta.sequence_number,
            block_index,
            block_start,
            block_end,
            mmap.len(),
            meta.block_offsets_start(mmap.len()),
        );
    }
    let uncompressed_length = u32::from_be_bytes(
        mmap[block_start..block_start + 4]
            .try_into()
            .with_context(|| {
                format!(
                    "Failed to read uncompressed_length from block {} header in {:08}.sst",
                    block_index, meta.sequence_number
                )
            })?,
    );
    let checksum = u32::from_be_bytes(
        mmap[block_start + 4..block_start + 8]
            .try_into()
            .with_context(|| {
                format!(
                    "Failed to read checksum from block {} header in {:08}.sst",
                    block_index, meta.sequence_number
                )
            })?,
    );
    let block = &mmap[block_start + BLOCK_HEADER_SIZE..block_end];
    Ok((uncompressed_length, checksum, block))
}

/// Verifies the CRC32 checksum of on-disk block data. Returns an error on mismatch.
fn verify_checksum(
    meta: &StaticSortedFileMetaData,
    data: &[u8],
    expected: u32,
    block_index: u16,
) -> Result<()> {
    let actual = checksum_block(data);
    if actual != expected {
        bail!(
            "Cache corruption detected: checksum mismatch in block {} of {:08}.sst (expected \
             {:08x}, got {:08x})",
            block_index,
            meta.sequence_number,
            expected,
            actual
        );
    }
    Ok(())
}

/// An iterator over all entries in a SST file in sorted order.
pub struct StaticSortedFileIter {
    /// The memory-mapped file, wrapped in `Rc` for non-atomic refcounting.
    /// All `RcBytes` slices produced during iteration share this `Rc`.
    mmap: Rc<Mmap>,
    /// Metadata (sequence number, block count) needed for block access.
    meta: StaticSortedFileMetaData,

    /// The root index block entries (body bytes starting after the type byte).
    /// SST files have exactly one index level.
    index_entries: RcBytes,
    /// Total number of key block references in the index block.
    index_block_count: usize,
    /// Next index entry to read from the index block.
    index_pos: usize,
    current_key_block: CurrentKeyBlock,
    /// Single-entry value block cache. Within a key block, entries reference
    /// value blocks sequentially and don't revisit earlier blocks, so caching
    /// just the current one avoids redundant decompression.
    value_block_cache: Option<(u16, RcBytes)>,
}

enum CurrentKeyBlockKind {
    /// Variable-size entries with an offset table for random access.
    Variable { offsets: RcBytes, hash_len: u8 },
    /// Fixed-size entries with uniform key size and value type (no offset table).
    Fixed {
        hash_len: u8,
        key_size: usize,
        value_type: u8,
        stride: usize,
    },
}

struct CurrentKeyBlock {
    kind: CurrentKeyBlockKind,
    entries: RcBytes,
    /// Number of entries in this key block (max ~819 per 16 KiB block).
    entry_count: u32,
    /// Current position within the key block.
    index: u32,
}

impl Iterator for StaticSortedFileIter {
    type Item = Result<LookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        self.next_internal().transpose()
    }
}

impl StaticSortedFileIter {
    /// Opens an SST file for sequential iteration. Uses `MADV_SEQUENTIAL` for
    /// read-ahead and wraps the mmap in `Rc<Mmap>` directly (no `Arc`),
    /// eliminating all atomic refcounting during iteration.
    pub fn open(db_path: &Path, meta: StaticSortedFileMetaData) -> Result<Self> {
        let filename = format!("{:08}.sst", meta.sequence_number);
        let path = db_path.join(&filename);
        let file = File::open(&path)
            .with_context(|| format!("Failed to open SST file {}", path.display()))?;
        let mmap = unsafe { Mmap::map(&file) }.with_context(|| {
            format!(
                "Failed to mmap SST file {} ({} bytes)",
                path.display(),
                file.metadata().map(|m| m.len()).unwrap_or(0)
            )
        })?;
        #[cfg(unix)]
        mmap.advise(memmap2::Advice::Sequential)?;
        advise_mmap_for_persistence(&mmap)?;
        Self::new(Rc::new(mmap), meta)
            .with_context(|| format!("Unable to open static sorted file {filename}"))
    }

    fn new(mmap: Rc<Mmap>, meta: StaticSortedFileMetaData) -> Result<Self> {
        let root_block_index = meta.block_count - 1;
        let block_rc = Self::read_block_rc(&mmap, &meta, root_block_index)?;
        let block_type = block_rc[0];

        // The builder always writes an index block as the root block.
        if block_type != BLOCK_TYPE_INDEX {
            bail!("Root block must be an index block");
        }
        let block_len = block_rc.len();
        let block_indices_count = (block_len - 1 + 8) / 10;
        let first_child = u16::from_be_bytes(block_rc[1..3].try_into().unwrap());
        let index_entries = block_rc.slice(1..block_len);

        let current_key_block = Self::parse_key_block(&mmap, &meta, first_child)?;
        Ok(StaticSortedFileIter {
            mmap,
            meta,
            index_entries,
            index_block_count: block_indices_count,
            index_pos: 1,
            current_key_block,
            value_block_cache: None,
        })
    }

    /// Reads a block, decompresses if needed, verifies checksum. Returns `RcBytes`.
    fn read_block_rc(
        mmap: &Rc<Mmap>,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
    ) -> Result<RcBytes> {
        let (uncompressed_length, expected_checksum, block) =
            get_raw_block_slice(mmap, meta, block_index).with_context(|| {
                format!(
                    "Failed to read raw block {} from {:08}.sst",
                    block_index, meta.sequence_number
                )
            })?;

        verify_checksum(meta, block, expected_checksum, block_index)?;

        if uncompressed_length == 0 {
            // Uncompressed: wrap the mmap slice in RcBytes (Rc clone, no atomic)
            return Ok(unsafe { RcBytes::from_mmap(mmap, block) });
        }

        let buffer = crate::compression::decompress_into_rc(uncompressed_length, block)
            .with_context(|| {
                format!(
                    "Failed to decompress block {} from {:08}.sst ({} bytes uncompressed)",
                    block_index, meta.sequence_number, uncompressed_length
                )
            })?;
        Ok(RcBytes::from(buffer))
    }

    /// Returns `(uncompressed_length, checksum, block)` as `RcBytes`.
    fn get_raw_block_rc(
        mmap: &Rc<Mmap>,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
    ) -> Result<(u32, u32, RcBytes)> {
        let (uncompressed_length, checksum, block) = get_raw_block_slice(mmap, meta, block_index)?;
        Ok((uncompressed_length, checksum, unsafe {
            RcBytes::from_mmap(mmap, block)
        }))
    }

    /// Reads a small value block, using a single-entry cache. Returns `RcBytes`.
    fn read_small_value_block_rc(
        mmap: &Rc<Mmap>,
        meta: &StaticSortedFileMetaData,
        cache: &mut Option<(u16, RcBytes)>,
        block_index: u16,
    ) -> Result<RcBytes> {
        if let Some((idx, block)) = cache.as_ref()
            && *idx == block_index
        {
            return Ok(block.clone());
        }
        let block = Self::read_block_rc(mmap, meta, block_index)?;
        *cache = Some((block_index, block.clone()));
        Ok(block)
    }

    /// Handles a key match, producing `IterValue` (uses `RcBytes`).
    fn handle_key_match_rc(
        mmap: &Rc<Mmap>,
        meta: &StaticSortedFileMetaData,
        ty: u8,
        val: &[u8],
        key_block_entries: &RcBytes,
        value_block_cache: &mut Option<(u16, RcBytes)>,
    ) -> Result<IterValue> {
        Ok(match ty {
            KEY_BLOCK_ENTRY_TYPE_SMALL => {
                let block = u16::from_be_bytes(val[0..2].try_into().unwrap());
                let size = u16::from_be_bytes(val[2..4].try_into().unwrap()) as usize;
                let position = u32::from_be_bytes(val[4..8].try_into().unwrap()) as usize;
                let value = Self::read_small_value_block_rc(mmap, meta, value_block_cache, block)?
                    .slice(position..position + size);
                IterValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
                let block = u16::from_be_bytes(val[0..2].try_into().unwrap());
                let value = Self::read_block_rc(mmap, meta, block)?;
                IterValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_BLOB => {
                let sequence_number = u32::from_be_bytes(val[0..4].try_into().unwrap());
                IterValue::Blob { sequence_number }
            }
            KEY_BLOCK_ENTRY_TYPE_DELETED => IterValue::Deleted,
            _ => {
                // Inline value — val is already the correct slice
                // SAFETY: val points into key_block_entries' data
                let value = unsafe { key_block_entries.slice_from_subslice(val) };
                IterValue::Slice { value }
            }
        })
    }

    /// Parses a key block at the given index, returning `RcBytes`-backed data.
    fn parse_key_block(
        mmap: &Rc<Mmap>,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
    ) -> Result<CurrentKeyBlock> {
        let block_rc = Self::read_block_rc(mmap, meta, block_index)?;
        let block = &*block_rc;
        let block_type = block[0];
        let entry_count = u32::from_be_bytes([0, block[1], block[2], block[3]]);
        match block_type {
            BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => {
                let hash_len = if block_type == BLOCK_TYPE_KEY_WITH_HASH {
                    8
                } else {
                    0
                };
                let n = entry_count as usize;
                let offsets_range = 4..4 + n * 4;
                let entries_range = 4 + n * 4..block_rc.len();
                let offsets = block_rc.clone().slice(offsets_range);
                let entries = block_rc.slice(entries_range);
                Ok(CurrentKeyBlock {
                    kind: CurrentKeyBlockKind::Variable { offsets, hash_len },
                    entries,
                    entry_count,
                    index: 0,
                })
            }
            BLOCK_TYPE_FIXED_KEY_WITH_HASH | BLOCK_TYPE_FIXED_KEY_NO_HASH => {
                let hash_len = if block_type == BLOCK_TYPE_FIXED_KEY_WITH_HASH {
                    8
                } else {
                    0
                };
                let key_size = block[4] as usize;
                let value_type = block[5];
                let val_size = entry_val_size(value_type)?;
                let stride = hash_len as usize + key_size + val_size;
                let entries_range = 6..block_rc.len();
                let entries = block_rc.slice(entries_range);
                Ok(CurrentKeyBlock {
                    kind: CurrentKeyBlockKind::Fixed {
                        hash_len,
                        key_size,
                        value_type,
                        stride,
                    },
                    entries,
                    entry_count,
                    index: 0,
                })
            }
            _ => {
                bail!("Invalid key block type: {block_type}");
            }
        }
    }

    /// Gets the next entry in the file and moves the cursor.
    fn next_internal(&mut self) -> Result<Option<LookupEntry>> {
        loop {
            let kb = &mut self.current_key_block;
            if kb.index < kb.entry_count {
                let index = kb.index as usize;
                let entry_count = kb.entry_count as usize;
                let GetKeyEntryResult { hash, key, ty, val } = match &kb.kind {
                    CurrentKeyBlockKind::Variable { offsets, hash_len } => {
                        get_key_entry(offsets, &kb.entries, entry_count, index, *hash_len)?
                    }
                    CurrentKeyBlockKind::Fixed {
                        hash_len,
                        key_size,
                        value_type,
                        stride,
                    } => get_fixed_key_entry(
                        &kb.entries,
                        index,
                        *hash_len,
                        *key_size,
                        *value_type,
                        *stride,
                    ),
                };
                let full_hash = if hash.is_empty() {
                    crate::key::hash_key(&key)
                } else {
                    u64::from_be_bytes(hash.try_into().unwrap())
                };
                let value = if ty == KEY_BLOCK_ENTRY_TYPE_MEDIUM {
                    let block = u16::from_be_bytes(val[0..2].try_into().unwrap());
                    let (uncompressed_size, checksum, block) =
                        Self::get_raw_block_rc(&self.mmap, &self.meta, block)?;
                    IterValue::Medium {
                        uncompressed_size,
                        checksum,
                        block,
                    }
                } else {
                    Self::handle_key_match_rc(
                        &self.mmap,
                        &self.meta,
                        ty,
                        val,
                        &kb.entries,
                        &mut self.value_block_cache,
                    )?
                };
                let entry = LookupEntry {
                    hash: full_hash,
                    key: unsafe { kb.entries.slice_from_subslice(key) },
                    value,
                };
                kb.index += 1;
                return Ok(Some(entry));
            }
            if self.index_pos < self.index_block_count {
                let base = self.index_pos * 10;
                let block_index =
                    u16::from_be_bytes(self.index_entries[base..base + 2].try_into().unwrap());
                self.index_pos += 1;
                self.current_key_block =
                    Self::parse_key_block(&self.mmap, &self.meta, block_index)?;
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

/// Checks if a query key equals an entry key, optionally comparing stored hashes first.
/// When a hash is stored (8 bytes), compares hashes before keys for speed.
/// When no hash is stored, compares keys directly (avoiding hash recomputation).
fn entry_matches_key<K: QueryKey>(
    entry_hash: &[u8],
    entry_key: &[u8],
    full_hash: u64,
    query_key: &K,
) -> bool {
    if entry_hash.is_empty() {
        // No hash stored - compare keys directly instead of recomputing hash
        query_key.cmp(entry_key) == Ordering::Equal
    } else {
        // Hash stored - cheap 8-byte comparison first, then key comparison
        full_hash.to_be_bytes()[..] == *entry_hash && query_key.cmp(entry_key) == Ordering::Equal
    }
}

/// Returns the byte size of the value portion for a given key block entry type.
fn entry_val_size(ty: u8) -> Result<usize> {
    match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => Ok(SMALL_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => Ok(MEDIUM_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_BLOB => Ok(BLOB_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_DELETED => Ok(DELETED_VALUE_REF_SIZE),
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
            Ok((ty - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as usize)
        }
        _ => bail!("Invalid key block entry type: {ty}"),
    }
}

/// Reads the type and start offset from an offset table entry.
/// Each entry is 4 bytes: 1 byte type + 3 bytes BE offset.
#[inline(always)]
fn read_offset_entry(offsets: &[u8], index: usize) -> (u8, usize) {
    let base = index * 4;
    let word = u32::from_be_bytes(offsets[base..base + 4].try_into().unwrap());
    let ty = (word >> 24) as u8;
    let offset = (word & 0x00FF_FFFF) as usize;
    (ty, offset)
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
    let (ty, start) = read_offset_entry(offsets, index);
    let end = if index == entry_count - 1 {
        entries.len()
    } else {
        let (_, next_start) = read_offset_entry(offsets, index + 1);
        next_start
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

/// Reads a key entry from a fixed-size key block by direct indexing.
///
/// All entries have the same key size and value type, so positions are computed
/// arithmetically with no offset table indirection.
fn get_fixed_key_entry<'l>(
    entries: &'l [u8],
    index: usize,
    hash_len: u8,
    key_size: usize,
    value_type: u8,
    stride: usize,
) -> GetKeyEntryResult<'l> {
    let hash_len_usize = hash_len as usize;
    let start = index * stride;
    GetKeyEntryResult {
        hash: &entries[start..start + hash_len_usize],
        key: &entries[start + hash_len_usize..start + hash_len_usize + key_size],
        ty: value_type,
        val: &entries[start + hash_len_usize + key_size..(index + 1) * stride],
    }
}
