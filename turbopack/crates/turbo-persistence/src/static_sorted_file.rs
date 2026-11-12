use std::{
    cmp::Ordering,
    hash::BuildHasherDefault,
    io,
    marker::PhantomData,
    ops::{Deref, Range},
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering as AtomicOrdering},
    },
};

use anyhow::{Context, Result, bail, ensure};
use fs_err::File;
#[cfg(feature = "mmap")]
use memmap2::Mmap;
use quick_cache::{Lifecycle, sync::GuardResult};
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use zerocopy::IntoBytes;

#[cfg(feature = "mmap")]
use crate::mmap_helper::advise_mmap_for_persistence;
use crate::{
    AccessMode, Compression, QueryKey,
    arc_bytes::ArcBytes,
    be,
    compression::checksum_block,
    constants::MAX_INLINE_VALUE_SIZE,
    lookup_entry::{IterValue, LookupEntry, LookupValue},
    rc_bytes::RcBytes,
    shared_bytes::SharedBytes,
    static_sorted_file_builder::{
        BLOCK_HEADER_SIZE, INDEX_BLOCK_ENTRY_SIZE, INDEX_BLOCK_HEADER_SIZE,
    },
};

/// The block header for an index block.
pub const BLOCK_TYPE_INDEX: u8 = 0;
/// The block header for a key block with 8-byte hash per entry.
pub const BLOCK_TYPE_KEY_WITH_HASH: u8 = 1;
/// The block header for a key block without hash. Entries are ordered by key.
pub const BLOCK_TYPE_KEY_NO_HASH: u8 = 2;
/// The block header for a fixed-size key block with 8-byte hash per entry.
pub const BLOCK_TYPE_FIXED_KEY_WITH_HASH: u8 = 3;
/// The block header for a fixed-size key block without hash. Entries are ordered by key.
pub const BLOCK_TYPE_FIXED_KEY_NO_HASH: u8 = 4;

/// Whether a key block stores a hash per entry, and therefore what order its entries are in.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KeyBlockLayout {
    /// 8-byte hash stored ahead of each key; entries sorted by `(hash, key)`.
    HashThenKey,
    /// No hash stored; entries sorted by key.
    KeyOnly,
}

impl KeyBlockLayout {
    /// Bytes each entry spends on its stored hash: 8, or 0 when the hash is omitted.
    #[inline]
    pub fn hash_len(self) -> u8 {
        match self {
            KeyBlockLayout::HashThenKey => size_of::<u64>() as u8,
            KeyBlockLayout::KeyOnly => 0,
        }
    }

    /// The on-disk block type byte for this layout, for `fixed`-size or variable-size entries.
    #[inline]
    pub fn block_type(self, fixed: bool) -> u8 {
        match (self, fixed) {
            (KeyBlockLayout::HashThenKey, false) => BLOCK_TYPE_KEY_WITH_HASH,
            (KeyBlockLayout::KeyOnly, false) => BLOCK_TYPE_KEY_NO_HASH,
            (KeyBlockLayout::HashThenKey, true) => BLOCK_TYPE_FIXED_KEY_WITH_HASH,
            (KeyBlockLayout::KeyOnly, true) => BLOCK_TYPE_FIXED_KEY_NO_HASH,
        }
    }

    /// Decodes a key block's type byte into its layout, plus whether entries are fixed-size.
    /// Returns `None` for a byte that is not a key block type.
    #[inline]
    pub fn from_block_type(block_type: u8) -> Option<(Self, bool)> {
        match block_type {
            BLOCK_TYPE_KEY_WITH_HASH => Some((KeyBlockLayout::HashThenKey, false)),
            BLOCK_TYPE_KEY_NO_HASH => Some((KeyBlockLayout::KeyOnly, false)),
            BLOCK_TYPE_FIXED_KEY_WITH_HASH => Some((KeyBlockLayout::HashThenKey, true)),
            BLOCK_TYPE_FIXED_KEY_NO_HASH => Some((KeyBlockLayout::KeyOnly, true)),
            _ => None,
        }
    }
}

/// Written in a fixed-size key block header's value type field when entries share a value size but
/// not a value type. Each entry then carries its own type byte ahead of its value.
pub const FIXED_KEY_BLOCK_MIXED_VALUE_TYPE: u8 = 4;

/// The tag for a small-sized value.
pub const KEY_BLOCK_ENTRY_TYPE_SMALL: u8 = 0;
/// The tag for the blob value.
pub const KEY_BLOCK_ENTRY_TYPE_BLOB: u8 = 1;
/// The tag for the deleted value. This is a *key* tombstone: it deletes every value for the key.
pub const KEY_BLOCK_ENTRY_TYPE_KEY_DELETED: u8 = 2;
/// The tag for a medium-sized value.
pub const KEY_BLOCK_ENTRY_TYPE_MEDIUM: u8 = 3;
/// The minimum tag for inline values. The actual size is (tag - INLINE_MIN).
pub const KEY_BLOCK_ENTRY_TYPE_INLINE_MIN: u8 = 8;
/// The minimum tag for a key-value tombstone, which deletes only the one value it carries and
/// leaves other values for the same key intact. Only meaningful for
/// [`FamilyKind::MultiValue`][crate::FamilyKind::MultiValue] families.
///
/// This mirrors the inline value range: the deleted value is stored inline in the key block and
/// its size is (tag - KEY_VALUE_DELETED_MIN). Only inline-sized values can be deleted this way —
/// a tombstone for a larger value would have to store a second copy of it, costing more than the
/// value it reclaims.
pub const KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN: u8 =
    KEY_BLOCK_ENTRY_TYPE_INLINE_MIN + MAX_INLINE_VALUE_SIZE as u8 + 1;

/// Size of one variable-size key block offset table entry when the block stores no hash:
/// 1 byte entry type packed into the top of a 3-byte in-block position.
pub const KEY_BLOCK_TABLE_ENTRY_SIZE_NO_HASH: usize = 4;
/// Size of one variable-size key block offset table entry when the block stores a hash: the key's
/// 8-byte hash followed by the type/position word.
///
/// The hash lives in the table rather than beside the key so that a binary search reads only this
/// dense array — `compare_hash_key` compares the hash first and reaches for the key only when two
/// hashes are equal, so the payload is touched once on a match and never on a miss. Total bytes are
/// unchanged: the table grows by 8 per entry and the payload shrinks by the same.
pub const KEY_BLOCK_TABLE_ENTRY_SIZE_WITH_HASH: usize =
    KEY_BLOCK_TABLE_ENTRY_SIZE_NO_HASH + size_of::<u64>();

/// Bytes per offset table entry for a variable-size key block with the given hash length.
#[inline(always)]
pub fn key_block_table_stride(hash_len: u8) -> usize {
    KEY_BLOCK_TABLE_ENTRY_SIZE_NO_HASH + hash_len as usize
}

/// Encoded size of a small value reference: 2B block index + 2B size + 4B offset.
pub(crate) const SMALL_VALUE_REF_SIZE: usize = 8;
/// Encoded size of a medium value reference: 2B block index.
pub(crate) const MEDIUM_VALUE_REF_SIZE: usize = 2;
/// Encoded size of a blob value reference: 4B blob id.
pub(crate) const BLOB_VALUE_REF_SIZE: usize = 4;
/// Encoded size of a deleted (tombstone) value reference.
pub(crate) const KEY_DELETED_REF_SIZE: usize = 0;

// Static assertion: both the inline range and the key-value tombstone range that follows it must
// fit in the key type byte. The tombstone range starts after the inline range and is the same
// width, so the tombstone range's top is the binding constraint.
const _: () = assert!(
    MAX_INLINE_VALUE_SIZE <= (u8::MAX - KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN) as usize,
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
            // Mmap-backed blocks bypass the cache (served directly from mmap),
            // so this branch should never be reached.
            debug_assert!(
                !val.is_mmap_backed(),
                "mmap-backed block should not be inserted into BlockCache"
            );
            64
        } else {
            val.len() as u64 + 8
        }
    }
}

/// Lifecycle hooks for the block cache that prevent eviction of entries
/// still referenced outside the cache (i.e., with `Arc` strong count > 1).
#[derive(Clone, Default)]
pub struct BlockCacheLifecycle;

impl Lifecycle<(u32, u16), ArcBytes> for BlockCacheLifecycle {
    type RequestState = ();

    #[inline]
    fn is_pinned(&self, _key: &(u32, u16), val: &ArcBytes) -> bool {
        val.is_shared_arc()
    }

    #[inline]
    fn begin_request(&self) -> Self::RequestState {}

    #[inline]
    fn on_evict(&self, _state: &mut Self::RequestState, _key: (u32, u16), _val: ArcBytes) {}
}

pub type BlockCache = quick_cache::sync::Cache<
    (u32, u16),
    ArcBytes,
    BlockWeighter,
    BuildHasherDefault<FxHasher>,
    BlockCacheLifecycle,
>;

/// Trait abstracting value block reading for `handle_key_match_generic`.
trait ValueBlockCache<B: SharedBytes> {
    fn get_or_read(
        self,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
        compression: Compression,
    ) -> Result<B>;
    fn read_uncached(
        self,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
        compression: Compression,
    ) -> Result<B>;
}

/// Bundles the lookup backing with the shared block cache and per-file CRC bitmap.
#[derive(Clone, Copy)]
struct ArcBlockCacheReader<'a> {
    backing: &'a StaticSortedFileBacking,
    block_offsets: &'a BlockOffsets,
    cache: &'a BlockCache,
    verified_blocks: &'a [AtomicU64],
}

impl ValueBlockCache<ArcBytes> for ArcBlockCacheReader<'_> {
    fn get_or_read(
        self,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
        compression: Compression,
    ) -> Result<ArcBytes> {
        // A value block's bytes are returned to the caller of `get`, so this one must own its
        // handle. For an uncompressed mmap block that is the mmap refcount; for a compressed or
        // file-backed one the cache entry's.
        Ok(get_or_read_block(
            self.backing,
            self.block_offsets,
            meta,
            block_index,
            self.cache,
            self.verified_blocks,
            compression,
        )?
        .into_owned(self.backing))
    }

    fn read_uncached(
        self,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
        compression: Compression,
    ) -> Result<ArcBytes> {
        read_block_lookup(
            self.backing,
            self.block_offsets,
            meta,
            block_index,
            compression,
        )
    }
}

/// Iteration-path reader with a lightweight single-entry cache for sequential reads.
struct RcBlockCacheReader<'a> {
    file: &'a File,
    block_offsets: &'a BlockOffsets,
    cache: &'a mut Option<(u16, RcBytes)>,
}

impl ValueBlockCache<RcBytes> for RcBlockCacheReader<'_> {
    fn get_or_read(
        self,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
        compression: Compression,
    ) -> Result<RcBytes> {
        if let Some((idx, block)) = self.cache.as_ref()
            && *idx == block_index
        {
            return Ok(block.clone());
        }
        let block = read_block_iter(
            self.file,
            self.block_offsets,
            meta,
            block_index,
            compression,
        )?;
        *self.cache = Some((block_index, block.clone()));
        Ok(block)
    }

    fn read_uncached(
        self,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
        compression: Compression,
    ) -> Result<RcBytes> {
        read_block_iter(
            self.file,
            self.block_offsets,
            meta,
            block_index,
            compression,
        )
    }
}

#[derive(Clone, Copy, Debug)]
pub struct StaticSortedFileMetaData {
    /// The sequence number of this file.
    pub sequence_number: u32,
    /// The number of blocks in the SST file.
    pub block_count: u16,
}

/// An SST's block-offset table, read and validated once when the file is opened.
///
/// [`BlockOffsets::read`] checks that every block is at least [`BLOCK_HEADER_SIZE`] bytes long and
/// ends at or before the start of the table, so [`BlockOffsets::block_range`] needs no further
/// checks.
#[derive(Debug)]
struct BlockOffsets(Box<[u32]>);

impl BlockOffsets {
    /// Reads the block-offset table of `file` (`file_len` bytes long) with one positional read,
    /// then decodes and validates it in place in a single pass.
    fn read(file: &File, meta: &StaticSortedFileMetaData, file_len: usize) -> Result<Self> {
        let block_count = meta.block_count as usize;
        let table_start = file_len
            .checked_sub(block_count * size_of::<u32>())
            .with_context(|| {
                format!(
                    "{:08}.sst is too short ({file_len} bytes) for its block-offset table of \
                     {block_count} blocks",
                    meta.sequence_number
                )
            })?;
        let mut offsets = vec![0u32; block_count].into_boxed_slice();
        pread(file, offsets.as_mut_bytes(), table_start as u64).with_context(|| {
            format!(
                "Failed to read the block-offset table of {:08}.sst",
                meta.sequence_number
            )
        })?;
        let mut start = 0;
        for (index, offset) in offsets.iter_mut().enumerate() {
            *offset = u32::from_be(*offset);
            let end = *offset as usize;
            ensure!(
                end.checked_sub(start)
                    .is_some_and(|len| len >= BLOCK_HEADER_SIZE),
                "block {index} of {:08}.sst spans {start}..{end}, shorter than its \
                 {BLOCK_HEADER_SIZE}-byte header",
                meta.sequence_number
            );
            start = end;
        }
        ensure!(
            start <= table_start,
            "the blocks of {:08}.sst end at {start}, past the start of its block-offset table at \
             {table_start}",
            meta.sequence_number
        );
        Ok(Self(offsets))
    }

    /// The byte range of block `block_index` in the file, header included.
    ///
    /// Only the index can be wrong here; everything else was checked by [`BlockOffsets::read`].
    #[inline]
    fn block_range(&self, block_index: u16) -> Result<Range<usize>> {
        let index = block_index as usize;
        let Some(&end) = self.0.get(index) else {
            bail!(
                "block index {block_index} out of bounds ({} blocks)",
                self.0.len()
            );
        };
        let start = if index == 0 {
            0
        } else {
            self.0[index - 1] as usize
        };
        Ok(start..end as usize)
    }
}

enum StaticSortedFileBacking {
    #[cfg(feature = "mmap")]
    Mmap(Arc<Mmap>),
    File {
        file: Arc<File>,
    },
}

/// An SST file accessed through mmap or positional file reads.
pub struct StaticSortedFile {
    /// The meta file of this file.
    meta: StaticSortedFileMetaData,
    backing: StaticSortedFileBacking,
    block_offsets: BlockOffsets,
    /// One bit per block, set when that block's CRC has been verified at least once.
    /// Uncompressed (mmap-backed) blocks bypass the `BlockCache`, so without this
    /// bitmap the CRC would be re-computed on every access. `Relaxed` ordering
    /// suffices: racing first-time verifications are idempotent.
    verified_blocks: Box<[AtomicU64]>,
    compression: Compression,
    /// The index block, parsed once at open time.
    index: IndexBlock,
}

/// The index block of an SST file, read into memory and validated once when the file is opened.
///
/// Every lookup binary searches this one block, so everything that does not depend on the queried
/// hash is done here instead of per lookup: reading the block, verifying its CRC, checking the
/// block type, reading the first-child index, and splitting the entry array off the header. What
/// remains in [`StaticSortedFile::lookup_index_block`] is the search itself.
struct IndexBlock {
    /// The `(hash, block index)` entry array that follows the 3-byte header.
    entries: Box<[[u8; INDEX_BLOCK_ENTRY_SIZE]]>,
    /// Block index for hashes below the first entry's hash.
    first_block: u16,
}

impl IndexBlock {
    /// Reads the index block with [`read_index_block`] and validates its layout.
    fn read(
        file: &File,
        block_offsets: &BlockOffsets,
        meta: &StaticSortedFileMetaData,
    ) -> Result<Self> {
        let data: ArcBytes = read_index_block(file, block_offsets, meta)?;
        let block_index = meta.block_count - 1;
        ensure!(
            data.len() >= INDEX_BLOCK_HEADER_SIZE,
            "index block {} of {:08}.sst is too short ({} bytes)",
            block_index,
            meta.sequence_number,
            data.len()
        );
        let first_block = be::read_u16(&data[1..]);
        let (entries, rest) = data[INDEX_BLOCK_HEADER_SIZE..].as_chunks::<INDEX_BLOCK_ENTRY_SIZE>();
        ensure!(
            rest.is_empty(),
            "index block {} of {:08}.sst has {} trailing bytes past its last entry",
            block_index,
            meta.sequence_number,
            rest.len()
        );
        Ok(Self {
            entries: entries.into(),
            first_block,
        })
    }
}

/// Reads an SST's index block, which is always its last block, with one positional read.
///
/// Checks that the block is uncompressed (index blocks always are), that its CRC matches, and that
/// it starts with the index block type. Returns the block data after the block header.
fn read_index_block<B: SharedBytes>(
    file: &File,
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
) -> Result<B> {
    ensure!(
        meta.block_count > 0,
        "{:08}.sst has no blocks, so no index block",
        meta.sequence_number
    );
    let block_index = meta.block_count - 1;
    let range = block_range(block_offsets, meta, block_index)?;
    let (uncompressed_length, checksum, data) =
        pread_block::<B>(file, range).with_context(|| {
            format!(
                "Failed to read index block {} from {:08}.sst",
                block_index, meta.sequence_number
            )
        })?;
    ensure!(
        uncompressed_length == 0,
        "index block {} of {:08}.sst is compressed, but index blocks are always written \
         uncompressed",
        block_index,
        meta.sequence_number
    );
    // Verified here rather than through `verified_blocks`: this is the one and only read of this
    // block's bytes.
    verify_checksum(meta, &data, checksum, block_index)?;
    ensure!(
        data.first() == Some(&BLOCK_TYPE_INDEX),
        "block {} of {:08}.sst is the last block but not an index block (type {:?})",
        block_index,
        meta.sequence_number,
        data.first()
    );
    Ok(data)
}

impl StaticSortedFile {
    /// Opens an SST file using the configured access mode.
    ///
    /// The block-offset table and index blocks are eagerly read and validated. Key and value blocks
    /// stay lazy, read on demand.
    pub fn open(
        db_path: &Path,
        meta: StaticSortedFileMetaData,
        compression: Compression,
        access_mode: AccessMode,
    ) -> Result<Self> {
        let filename = format!("{:08}.sst", meta.sequence_number);
        let path = db_path.join(&filename);
        let file = File::open(&path)?;
        let file_len: usize = file.metadata()?.len().try_into()?;
        let block_offsets = BlockOffsets::read(&file, &meta, file_len)?;
        let index = IndexBlock::read(&file, &block_offsets, &meta)?;
        let backing = match access_mode {
            #[cfg(feature = "mmap")]
            AccessMode::Mmap => {
                let mmap = unsafe { Mmap::map(file.file()) }.with_context(|| {
                    format!(
                        "Failed to mmap SST file {} ({file_len} bytes)",
                        path.display(),
                    )
                })?;
                ensure!(
                    mmap.len() == file_len,
                    "{filename} changed size while being opened ({file_len} -> {} bytes)",
                    mmap.len()
                );
                // Lookups touch only a few blocks of most SSTs, so `Random` stops the kernel from
                // reading around every fault. In exchange, `get_raw_block_slice` asks for a
                // multi-page block with `WillNeed` before its first full read. Those hints need the
                // page size; without it, keep the default advice so read-around still prefetches.
                #[cfg(unix)]
                if page_size().is_some() {
                    mmap.advise(memmap2::Advice::Random)?;
                }
                advise_mmap_for_persistence(&mmap)?;
                StaticSortedFileBacking::Mmap(Arc::new(mmap))
            }
            AccessMode::File => StaticSortedFileBacking::File {
                file: Arc::new(file),
            },
        };
        let bitmap_words = (meta.block_count as usize).div_ceil(u64::BITS as usize);
        let verified_blocks = (0..bitmap_words)
            .map(|_| AtomicU64::new(0))
            .collect::<Box<[_]>>();

        Ok(Self {
            meta,
            backing,
            block_offsets,
            verified_blocks,
            compression,
            index,
        })
    }

    /// The index block's entry array: `(8-byte hash, 2-byte block index)` pairs, sorted by hash.
    #[inline]
    fn index_entries(&self) -> &[[u8; INDEX_BLOCK_ENTRY_SIZE]] {
        &self.index.entries
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
        // The index block was resolved, verified and parsed at open time.
        let key_block_index = self.lookup_index_block(key_hash);

        // Borrowed, not owned: the search only reads the block, and any value it returns is
        // either copied inline or points into a *value* block, so nothing outlives this call.
        let key_block = get_or_read_block(
            &self.backing,
            &self.block_offsets,
            &self.meta,
            key_block_index,
            key_block_cache,
            &self.verified_blocks,
            self.compression,
        )?;
        let key_block = key_block.as_slice();

        let reader = ArcBlockCacheReader {
            backing: &self.backing,
            block_offsets: &self.block_offsets,
            cache: value_block_cache,
            verified_blocks: &self.verified_blocks,
        };
        let block_type = be::read_u8(key_block);
        match KeyBlockLayout::from_block_type(block_type) {
            Some((layout, false)) => self
                .lookup_variable_key_block::<K, FIND_ALL>(key_block, key_hash, key, layout, reader),
            Some((layout, true)) => {
                self.lookup_fixed_key_block::<K, FIND_ALL>(key_block, key_hash, key, layout, reader)
            }
            None => {
                bail!("Invalid block type");
            }
        }
    }

    /// Finds the key block that would hold `hash`.
    ///
    /// Entry `i`'s hash is the lowest hash in the block it names, so a hash below the first entry
    /// belongs to `first_block` and any other hash belongs to its predecessor entry's block.
    /// Everything that does not depend on `hash` was resolved by [`IndexBlock::read`] at open
    /// time, so this is the binary search and nothing else.
    #[inline]
    fn lookup_index_block(&self, hash: u64) -> u16 {
        let entries = self.index_entries();
        match entries.binary_search_by(|entry| be::read_u64(entry).cmp(&hash)) {
            Ok(i) => be::read_u16(&entries[i][size_of::<u64>()..]),
            Err(0) => self.index.first_block,
            Err(i) => be::read_u16(&entries[i - 1][size_of::<u64>()..]),
        }
    }

    /// Looks up a key in a key block and the value in a value block.
    ///
    /// If `FIND_ALL` is false, returns after finding the first match.
    /// If `FIND_ALL` is true, collects all entries with the same key.
    fn lookup_variable_key_block<K: QueryKey, const FIND_ALL: bool>(
        &self,
        block: &[u8],
        key_hash: u64,
        key: &K,
        layout: KeyBlockLayout,
        reader: ArcBlockCacheReader<'_>,
    ) -> Result<SstLookupResult> {
        let hash_len = layout.hash_len();
        ensure!(block.len() >= 4, "key block too short");
        let entry_count = be::read_u24(&block[1..]) as usize;
        let data = &block[4..];
        let table_len = entry_count * key_block_table_stride(hash_len);
        ensure!(
            data.len() >= table_len,
            "key block too short for {entry_count} entries"
        );
        let offsets = &data[..table_len];
        let entries = &data[table_len..];

        self.lookup_block_inner::<K, FIND_ALL>(entry_count, key_hash, key, layout, reader, |i| {
            get_key_entry(offsets, entries, entry_count, i, hash_len)
        })
    }

    /// Looks up a key in a fixed-size key block.
    ///
    /// Fixed-size key blocks store entries at predictable offsets (no offset table),
    /// enabling direct indexing during binary search.
    fn lookup_fixed_key_block<K: QueryKey, const FIND_ALL: bool>(
        &self,
        block: &[u8],
        key_hash: u64,
        key: &K,
        layout: KeyBlockLayout,
        reader: ArcBlockCacheReader<'_>,
    ) -> Result<SstLookupResult> {
        ensure!(block.len() >= 6, "fixed key block too short");
        let entry_count = be::read_u24(&block[1..]) as usize;
        let key_size = be::read_u8(&block[4..]) as usize;
        let header_type = be::read_u8(&block[5..]);
        let FixedValueLayout {
            value_type,
            val_size,
            header_size,
        } = fixed_value_layout(block, header_type)?;
        let regions = FixedRegions::new(entry_count, layout, key_size, val_size);
        let entries = &block[header_size..];
        ensure!(
            entries.len() == regions.total_len(entry_count),
            "fixed key block for {entry_count} entries is the wrong size"
        );

        self.lookup_block_inner::<K, FIND_ALL>(entry_count, key_hash, key, layout, reader, |i| {
            get_fixed_key_entry(entries, i, regions, value_type)
        })
    }

    /// Shared binary search + collection logic for both key block variants.
    ///
    /// The `get_entry` closure abstracts over the difference between variable-size
    /// key blocks (offset table lookup) and fixed-size key blocks (stride-based indexing).
    fn lookup_block_inner<'a, K: QueryKey, const FIND_ALL: bool>(
        &self,
        entry_count: usize,
        key_hash: u64,
        key: &K,
        layout: KeyBlockLayout,
        reader: ArcBlockCacheReader<'_>,
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

            let comparison = compare_hash_key(layout, mid_hash, mid_key, key_hash, key);

            match comparison {
                Ordering::Less => r = m,
                Ordering::Equal => {
                    if !FIND_ALL {
                        // SingleValue mode: each key has exactly one entry
                        // this is enforced when writing
                        let result = self.handle_key_match(ty, val, reader)?;
                        return Ok(SstLookupResult::Found(SmallVec::from_buf([result])));
                    }
                    // FIND_ALL (MultiValue) mode: collect all values for this key.
                    // Within a key group, key-value tombstones sort first and key tombstones
                    // last. We scan backward to find the start of the key group, then forward to
                    // collect all entries.
                    let mut results = SmallVec::new();
                    for i in (l..m).rev() {
                        let GetKeyEntryResult {
                            hash,
                            key: entry_key,
                            ty,
                            val,
                        } = get_entry(i)?;
                        if !entry_matches_key(layout, hash, entry_key, key_hash, key) {
                            break;
                        }
                        results.push(self.handle_key_match(ty, val, reader)?);
                    }
                    // Restore on-disk order: callers depend on both ends of the key group, with
                    // key-value tombstones preceding the values they filter and a key tombstone
                    // landing last.
                    results.reverse();

                    // Add the entry at `m`
                    results.push(self.handle_key_match(ty, val, reader)?);
                    for i in (m + 1)..r {
                        let GetKeyEntryResult {
                            hash,
                            key: entry_key,
                            ty,
                            val,
                        } = get_entry(i)?;
                        if !entry_matches_key(layout, hash, entry_key, key_hash, key) {
                            break;
                        }
                        results.push(self.handle_key_match(ty, val, reader)?);
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
        reader: ArcBlockCacheReader<'_>,
    ) -> Result<LookupValue> {
        handle_key_match_generic(&self.meta, ty, val, self.compression, reader)
    }
}

/// A block obtained from the backing store or the block cache.
///
/// An uncompressed mmap block is borrowed straight out of the mmap. Only that borrow is needed to
/// search a key block, and taking it instead of an [`ArcBytes`] avoids touching the file's `mmap`
/// refcount — a single counter shared by every reader of the file, so the most contended one on
/// the read path. Anything that had to be decompressed or read into memory comes back owned, but
/// its refcount belongs to one cache entry rather than the whole file.
enum BlockRef<'l> {
    /// Borrowed from the memory-mapped file.
    #[cfg(feature = "mmap")]
    Mmap(&'l [u8]),
    /// Owned, and shared with the block cache. The zero-sized marker keeps the backing borrow
    /// lifetime represented in builds where the mmap variant is disabled.
    Cached(ArcBytes, PhantomData<&'l ()>),
}

impl BlockRef<'_> {
    #[inline]
    fn as_slice(&self) -> &[u8] {
        match self {
            #[cfg(feature = "mmap")]
            BlockRef::Mmap(data) => data,
            BlockRef::Cached(block, _) => block,
        }
    }

    /// Promotes to an owned handle, taking a refcount for the mmap case.
    ///
    /// Only needed by callers that hand the bytes to something outliving the lookup.
    #[inline]
    #[cfg_attr(not(feature = "mmap"), allow(unused_variables))]
    fn into_owned(self, backing: &StaticSortedFileBacking) -> ArcBytes {
        match self {
            #[cfg(feature = "mmap")]
            BlockRef::Mmap(data) => {
                let StaticSortedFileBacking::Mmap(mmap) = backing else {
                    // `get_or_read_block` only borrows from an mmap backing.
                    unreachable!("mmap-borrowed block with a file backing")
                };
                // SAFETY: the borrow came from this mmap, via `get_or_read_block`.
                unsafe { ArcBytes::from_mmap(mmap, data) }
            }
            BlockRef::Cached(block, _) => block,
        }
    }
}

/// Gets a block from the cache, or reads it from the mmap and inserts it.
///
/// Reads the block header exactly once via `get_raw_block_slice`, which locates the block in the
/// validated `block_offsets`. Uncompressed blocks bypass
/// the cache and are borrowed from the mmap; their CRC is verified at most
/// once per file open, tracked by `verified_blocks`. Compressed blocks are
/// looked up in `cache`; on a miss they are decompressed, CRC-verified, and
/// inserted. File-backed blocks always go through the cache, including
/// uncompressed ones, since there is nothing to borrow from.
fn get_or_read_block<'l>(
    backing: &'l StaticSortedFileBacking,
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
    cache: &BlockCache,
    verified_blocks: &[AtomicU64],
    compression: Compression,
) -> Result<BlockRef<'l>> {
    // `verified_blocks` tracks which mmap-backed blocks already passed their checksum. There is
    // no mmap backing without the feature, so the bitmap is unused there.
    #[cfg(not(feature = "mmap"))]
    let _ = verified_blocks;
    #[cfg(feature = "mmap")]
    let mmap_block = if let StaticSortedFileBacking::Mmap(mmap) = backing {
        // An unverified block is about to be read in full for the first time in this open (CRC
        // verification and, if compressed, decompression), so hint it. A verified block is either
        // in the block cache or touches only the bytes a lookup needs.
        let will_need = !is_block_verified(block_index, verified_blocks);
        let (uncompressed_length, checksum, block_data) =
            get_raw_block_slice(mmap, block_offsets, meta, block_index, will_need).with_context(
                || {
                    format!(
                        "Failed to read raw block {} from {:08}.sst",
                        block_index, meta.sequence_number
                    )
                },
            )?;

        if uncompressed_length == 0 {
            // Uncompressed: borrow directly from the mmap, taking no refcount.
            // Verify CRC only once per file open.
            verify_checksum_once(meta, block_data, checksum, block_index, verified_blocks)?;
            return Ok(BlockRef::Mmap(block_data));
        }
        Some((uncompressed_length, checksum, block_data))
    } else {
        None
    };
    // Without an mmap backing there is never a zero-copy block to borrow, so every block goes
    // through the decompress/cache path below.
    #[cfg(not(feature = "mmap"))]
    let mmap_block: Option<(u32, u32, &[u8])> = None;

    // Compressed: check cache; decompress and insert on miss.
    // File-backed blocks use the same cache, including uncompressed ones.
    Ok(BlockRef::Cached(
        match cache.get_value_or_guard(&(meta.sequence_number, block_index), None) {
            GuardResult::Value(block) => block,
            GuardResult::Guard(guard) => {
                let (uncompressed_length, checksum, block_data) = match mmap_block {
                    Some((uncompressed_length, checksum, block_data)) => (
                        uncompressed_length,
                        checksum,
                        RawBlock::Borrowed(block_data),
                    ),
                    None => get_raw_block(backing, block_offsets, meta, block_index)?,
                };
                // A cached block may have been evicted, so re-reading still
                // benefits from the bitmap to skip redundant CRC verification.
                match backing {
                    #[cfg(feature = "mmap")]
                    StaticSortedFileBacking::Mmap(_) => verify_checksum_once(
                        meta,
                        &block_data,
                        checksum,
                        block_index,
                        verified_blocks,
                    )?,
                    StaticSortedFileBacking::File { .. } => {
                        verify_checksum(meta, &block_data, checksum, block_index)?
                    }
                }
                let block = if uncompressed_length == 0 {
                    block_data.into_arc_bytes()
                } else {
                    ArcBytes::from_decompressed(compression, uncompressed_length, &block_data)
                        .with_context(|| {
                            format!(
                                "Failed to decompress block {} from {:08}.sst ({} bytes \
                                 uncompressed)",
                                block_index, meta.sequence_number, uncompressed_length
                            )
                        })?
                };
                let _ = guard.insert(block.clone());
                block
            }
            GuardResult::Timeout => unreachable!(),
        },
        PhantomData,
    ))
}

/// Asks the kernel to read `range` of the mapping ahead, if it spans more than one page.
///
/// Lookup mappings have `Random` advice, so without this hint the kernel faults in each page of a
/// multi-page block separately. Readahead is best effort, and single-page ranges gain nothing.
#[cfg(feature = "mmap")]
fn will_need_range(mmap: &Mmap, range: Range<usize>) {
    #[cfg(unix)]
    if let Some(page_size) = page_size()
        && spans_multiple_pages(&range, page_size)
    {
        #[cfg(test)]
        will_need_log::record(range.clone());
        let _ = mmap.advise_range(memmap2::Advice::WillNeed, range.start, range.len());
    }
    #[cfg(not(unix))]
    let _ = (mmap, range);
}

/// Whether the non-empty `range` crosses a page boundary.
#[cfg(all(feature = "mmap", unix))]
fn spans_multiple_pages(range: &Range<usize>, page_size: usize) -> bool {
    debug_assert!(!range.is_empty());
    range.start / page_size != (range.end - 1) / page_size
}

/// The system page size, queried once. `None` if it can't be determined, in which case block hints
/// are skipped.
#[cfg(all(feature = "mmap", unix))]
fn page_size() -> Option<usize> {
    static PAGE_SIZE: std::sync::OnceLock<Option<usize>> = std::sync::OnceLock::new();
    *PAGE_SIZE.get_or_init(|| {
        // SAFETY: `sysconf` has no preconditions.
        let size = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
        usize::try_from(size).ok().filter(|&size| size > 0)
    })
}

/// Records the ranges passed to `MADV_WILLNEED` on this thread, for tests.
#[cfg(all(test, feature = "mmap", unix))]
pub(crate) mod will_need_log {
    use std::{cell::RefCell, ops::Range};

    thread_local! {
        static LOG: RefCell<Vec<Range<usize>>> = const { RefCell::new(Vec::new()) };
    }

    pub(crate) fn record(range: Range<usize>) {
        LOG.with(|log| log.borrow_mut().push(range));
    }

    /// Returns and clears this thread's recorded ranges.
    pub(crate) fn take() -> Vec<Range<usize>> {
        LOG.with(|log| std::mem::take(&mut *log.borrow_mut()))
    }
}

/// Gets the raw block slice directly from a memory-mapped file.
/// Returns `(uncompressed_length, checksum, block_data)`.
///
/// With `will_need`, the caller is about to read the whole block, so the block (header included)
/// is requested with `WillNeed` before any of its bytes is read; see [`will_need_range`].
#[cfg(feature = "mmap")]
fn get_raw_block_slice<'a>(
    mmap: &'a Mmap,
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
    will_need: bool,
) -> Result<(u32, u32, &'a [u8])> {
    let range = block_range(block_offsets, meta, block_index)?;
    if will_need {
        will_need_range(mmap, range.clone());
    }
    let uncompressed_length = be::read_u32(&mmap[range.start..]);
    let checksum = be::read_u32(&mmap[range.start + 4..]);
    let block = &mmap[range.start + BLOCK_HEADER_SIZE..range.end];
    Ok((uncompressed_length, checksum, block))
}

/// Looks up block `block_index` in `block_offsets`, naming the file in the error.
fn block_range(
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
) -> Result<Range<usize>> {
    block_offsets
        .block_range(block_index)
        .with_context(|| format!("Corrupted file {:08}.sst", meta.sequence_number))
}

/// Reads a block, header included, at `range` with a positional read.
/// Returns `(uncompressed_length, checksum, block_data)`.
///
/// The block is read straight into the uninitialized allocation of the result and the header is
/// sliced off, so it is neither zeroed before the read nor copied after it.
fn pread_block<B: SharedBytes>(file: &File, range: Range<usize>) -> Result<(u32, u32, B)> {
    let bytes = B::read_filled(range.len(), |buf| pread_buf(file, buf, range.start as u64))?;
    let uncompressed_length = be::read_u32(&bytes);
    let checksum = be::read_u32(&bytes[4..]);
    let len = bytes.len();
    Ok((
        uncompressed_length,
        checksum,
        bytes.slice(BLOCK_HEADER_SIZE..len),
    ))
}

/// The on-disk bytes of a block after its header, still compressed unless the uncompressed length
/// in the header is 0.
enum RawBlock<'a> {
    /// Borrowed from the mmap.
    #[cfg_attr(not(feature = "mmap"), allow(dead_code))]
    Borrowed(&'a [u8]),
    /// Read from the file. The allocation also holds the header, which is sliced off.
    Owned(ArcBytes),
}

impl RawBlock<'_> {
    /// Returns the block as `ArcBytes`. Copies borrowed data, owned data is returned as is.
    fn into_arc_bytes(self) -> ArcBytes {
        match self {
            RawBlock::Borrowed(block) => ArcBytes::from(Arc::<[u8]>::from(block)),
            RawBlock::Owned(block) => block,
        }
    }
}

impl Deref for RawBlock<'_> {
    type Target = [u8];

    fn deref(&self) -> &[u8] {
        match self {
            RawBlock::Borrowed(block) => block,
            RawBlock::Owned(block) => block,
        }
    }
}

/// Reads a raw block from either backing. Mmap data remains borrowed; file data is owned.
fn get_raw_block<'a>(
    backing: &'a StaticSortedFileBacking,
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
) -> Result<(u32, u32, RawBlock<'a>)> {
    match backing {
        #[cfg(feature = "mmap")]
        StaticSortedFileBacking::Mmap(mmap) => {
            // Every caller with an mmap backing reads the whole block: medium value blocks, which
            // bypass the block cache, on every read.
            let (uncompressed_length, checksum, block) =
                get_raw_block_slice(mmap, block_offsets, meta, block_index, true)?;
            Ok((uncompressed_length, checksum, RawBlock::Borrowed(block)))
        }
        StaticSortedFileBacking::File { file } => {
            let range = block_range(block_offsets, meta, block_index)?;
            let (uncompressed_length, checksum, block) = pread_block(file, range)?;
            Ok((uncompressed_length, checksum, RawBlock::Owned(block)))
        }
    }
}

/// Reads exactly `buf.len()` bytes of `file` at `offset`. Errors name the file.
fn pread(file: &File, buf: &mut [u8], offset: u64) -> io::Result<()> {
    pread_buf(file, io::BorrowedBuf::from(buf).unfilled(), offset)
}

/// Reads exactly the capacity of `buf`, which may be uninitialized, from `file` at `offset`.
/// Errors name the file.
fn pread_buf(file: &File, buf: io::BorrowedCursor<'_, u8>, offset: u64) -> io::Result<()> {
    // `fs_err` has no `BorrowedCursor` reads, so add the path here.
    let with_path = |err: io::Error| {
        io::Error::new(
            err.kind(),
            format!("{err} reading {}", file.path().display()),
        )
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::FileExt;
        file.file()
            .read_buf_exact_at(buf, offset)
            .map_err(with_path)
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileExt;
        file.file()
            .seek_read_buf_exact(buf, offset)
            .map_err(with_path)
    }
    #[cfg(target_os = "wasi")]
    {
        // WASI has no exact variant, so loop like `read_buf_exact_at` does on unix.
        use std::os::wasi::fs::FileExt;
        let mut buf = buf;
        let mut offset = offset;
        while buf.capacity() > 0 {
            let written = buf.written();
            match file.file().read_buf_at(buf.reborrow(), offset) {
                Ok(()) => {}
                Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
                Err(err) => return Err(with_path(err)),
            }
            let read = buf.written() - written;
            if read == 0 {
                return Err(with_path(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "unexpected EOF",
                )));
            }
            offset += read as u64;
        }
        Ok(())
    }
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

/// Whether block `block_index`'s CRC has already been verified in this open. An out-of-range index
/// counts as unverified; reading the block reports the error.
#[cfg(feature = "mmap")]
fn is_block_verified(block_index: u16, verified_blocks: &[AtomicU64]) -> bool {
    let word_idx = block_index as usize / u64::BITS as usize;
    let bit = 1u64 << (block_index as usize % u64::BITS as usize);
    verified_blocks
        .get(word_idx)
        .is_some_and(|word| word.load(AtomicOrdering::Relaxed) & bit != 0)
}

/// Verifies a block's CRC using the `verified_blocks` bitmap to avoid redundant
/// work. In practice each block is verified once, but concurrent first-time
/// accesses may race and verify the same block more than once — this is harmless
/// since the check is deterministic and idempotent. Verification failures are
/// *not* recorded in the bitmap, so a corrupted block will be re-checked (and
/// fail again) on every access.
#[cfg_attr(not(feature = "mmap"), allow(dead_code))]
fn verify_checksum_once(
    meta: &StaticSortedFileMetaData,
    data: &[u8],
    expected: u32,
    block_index: u16,
    verified_blocks: &[AtomicU64],
) -> Result<()> {
    let word_idx = block_index as usize / u64::BITS as usize;
    let bit = 1u64 << (block_index as usize % u64::BITS as usize);
    if verified_blocks[word_idx].load(AtomicOrdering::Relaxed) & bit != 0 {
        return Ok(());
    }
    verify_checksum(meta, data, expected, block_index)?;
    verified_blocks[word_idx].fetch_or(bit, AtomicOrdering::Relaxed);
    Ok(())
}

/// Reads a lookup block, decompresses it if needed, and verifies its checksum.
fn read_block_lookup(
    backing: &StaticSortedFileBacking,
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
    compression: Compression,
) -> Result<ArcBytes> {
    let (uncompressed_length, checksum, block) =
        get_raw_block(backing, block_offsets, meta, block_index)?;
    verify_checksum(meta, &block, checksum, block_index)?;
    if uncompressed_length == 0 {
        return match (backing, block) {
            #[cfg(feature = "mmap")]
            (StaticSortedFileBacking::Mmap(mmap), RawBlock::Borrowed(block)) => {
                // SAFETY: block points into mmap.
                Ok(unsafe { ArcBytes::from_mmap(mmap, block) })
            }
            (_, block) => Ok(block.into_arc_bytes()),
        };
    }
    ArcBytes::from_decompressed(compression, uncompressed_length, &block).with_context(|| {
        format!(
            "Failed to decompress block {} from {:08}.sst ({} bytes uncompressed)",
            block_index, meta.sequence_number, uncompressed_length
        )
    })
}

/// Returns `(uncompressed_length, checksum, block)` wrapping the raw on-disk data as
/// `RcBytes` for the single-threaded iteration path.
fn get_raw_block_iter(
    file: &File,
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
) -> Result<(u32, u32, RcBytes)> {
    let range = block_range(block_offsets, meta, block_index)?;
    pread_block(file, range)
}

/// Reads an iteration block, decompresses it if needed, and verifies its checksum.
fn read_block_iter(
    file: &File,
    block_offsets: &BlockOffsets,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
    compression: Compression,
) -> Result<RcBytes> {
    let (uncompressed_length, checksum, block) =
        get_raw_block_iter(file, block_offsets, meta, block_index)?;
    verify_checksum(meta, &block, checksum, block_index)?;
    if uncompressed_length == 0 {
        return Ok(block);
    }
    RcBytes::from_decompressed(compression, uncompressed_length, &block).with_context(|| {
        format!(
            "Failed to decompress block {} from {:08}.sst ({} bytes uncompressed)",
            block_index, meta.sequence_number, uncompressed_length
        )
    })
}

/// Handles a key match by resolving the value reference. Generic over byte type.
fn handle_key_match_generic<B: SharedBytes>(
    meta: &StaticSortedFileMetaData,
    ty: u8,
    val: &[u8],
    compression: Compression,
    reader: impl ValueBlockCache<B>,
) -> Result<LookupValue<B>> {
    Ok(match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => {
            let block = be::read_u16(val);
            let size = be::read_u16(&val[2..]) as usize;
            let position = be::read_u32(&val[4..]) as usize;
            let value = reader
                .get_or_read(meta, block, compression)?
                .slice(position..position + size);
            LookupValue::Slice { value }
        }
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
            let block = be::read_u16(val);
            let value = reader.read_uncached(meta, block, compression)?;
            LookupValue::Slice { value }
        }
        KEY_BLOCK_ENTRY_TYPE_BLOB => {
            let sequence_number = be::read_u32(val);
            LookupValue::Blob { sequence_number }
        }
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED => LookupValue::KeyDeleted,
        // Must precede the inline arm: both are open-ended and the tombstone range sits above it.
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN => {
            let value = B::from_inline(val);
            LookupValue::KeyValueDeleted { value }
        }
        _ => {
            // Inline value — val is already the correct slice
            let value = B::from_inline(val);
            LookupValue::Slice { value }
        }
    })
}

/// An iterator over all entries in a SST file in sorted order.
pub struct StaticSortedFileIter {
    /// The SST file. Iteration reads each block with `pread` into an owned buffer, regardless of
    /// the database's [`AccessMode`]. Iteration is used by compaction, which merges whole
    /// files: through a mmap every page it touches would stay mapped and count towards the
    /// process memory until the kernel reclaims it, and `MADV_SEQUENTIAL` doesn't make it drop
    /// them as the scan advances. Reading into owned buffers bounds the memory of an open
    /// iterator to the blocks it currently holds. Blocks are decompressed into owned buffers
    /// anyway, so a mmap would only save the copy of uncompressed and medium blocks.
    file: File,
    block_offsets: BlockOffsets,
    /// Metadata (sequence number, block count) needed for block access.
    meta: StaticSortedFileMetaData,

    /// The root index block entries (body bytes starting after the type byte).
    /// SST files have exactly one index level.
    index_entries: RcBytes,
    /// Total key block references in the index block (first_child + boundary entries).
    num_index_entries: usize,
    /// Next index entry to read from the index block.
    index_pos: usize,
    current_key_block: CurrentKeyBlock,
    /// Single-entry value block cache. Within a key block, entries reference
    /// value blocks sequentially and don't revisit earlier blocks, so caching
    /// just the current one avoids redundant decompression.
    value_block_cache: Option<(u16, RcBytes)>,
    compression: Compression,
}

enum CurrentKeyBlockKind {
    /// Variable-size entries with an offset table for random access.
    Variable { offsets: RcBytes },
    /// Fixed-size entries with uniform key size and value size (no offset table).
    Fixed {
        /// The type shared by every entry, or `None` if each entry carries its own type byte.
        value_type: Option<u8>,
        regions: FixedRegions,
    },
}

impl CurrentKeyBlockKind {
    /// Decodes entry `index`, dispatching on the block's entry layout.
    ///
    /// The result borrows from `entries` and, for a variable block storing hashes, from the offset
    /// table held by `self` — hence the shared lifetime.
    fn entry<'l>(
        &'l self,
        entries: &'l [u8],
        entry_count: u32,
        index: usize,
        hash_len: u8,
    ) -> Result<GetKeyEntryResult<'l>> {
        match self {
            CurrentKeyBlockKind::Variable { offsets } => {
                get_key_entry(offsets, entries, entry_count as usize, index, hash_len)
            }
            CurrentKeyBlockKind::Fixed {
                value_type,
                regions,
            } => get_fixed_key_entry(entries, index, *regions, *value_type),
        }
    }
}

/// One entry of a [`CurrentKeyBlock::hash_order`] plan: the key's hash and the index of the entry
/// it was computed from.
struct HashOrderEntry {
    hash: u64,
    entry_index: u32,
}

struct CurrentKeyBlock {
    kind: CurrentKeyBlockKind,
    /// Whether entries carry a hash, and so what order they are stored in.
    layout: KeyBlockLayout,
    entries: RcBytes,
    /// Number of entries in this key block (max ~819 per 16 KiB block).
    entry_count: u32,
    /// Current iteration position. Indexes `hash_order` when that is present, and the block's
    /// entries directly otherwise.
    index: u32,
    /// Iteration plan for a [`KeyBlockLayout::KeyOnly`] block, in `(hash, key)` order.
    /// `None` for [`KeyBlockLayout::HashThenKey`], whose entries are already stored in that order.
    hash_order: Option<Vec<HashOrderEntry>>,
}

impl Iterator for StaticSortedFileIter {
    type Item = Result<LookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        self.next_internal().transpose()
    }
}

impl StaticSortedFileIter {
    /// Opens an SST file for sequential iteration. Blocks are always read with `pread`, not
    /// through a mmap, see the `file` field.
    pub fn open(
        db_path: &Path,
        meta: StaticSortedFileMetaData,
        compression: Compression,
    ) -> Result<Self> {
        let filename = format!("{:08}.sst", meta.sequence_number);
        let path = db_path.join(&filename);
        let file = File::open(&path)?;
        let file_len: usize = file.metadata()?.len().try_into()?;
        let block_offsets = BlockOffsets::read(&file, &meta, file_len)?;
        let index_block = read_index_block(&file, &block_offsets, &meta)
            .with_context(|| format!("Unable to open static sorted file {filename}"))?;
        Self::new(file, block_offsets, index_block, meta, compression)
            .with_context(|| format!("Unable to open static sorted file {filename}"))
    }

    /// `index_block` is the verified index block data from [`read_index_block`].
    fn new(
        file: File,
        block_offsets: BlockOffsets,
        index_block: RcBytes,
        meta: StaticSortedFileMetaData,
        compression: Compression,
    ) -> Result<Self> {
        let block = index_block;
        let block_len = block.len();
        ensure!(block_len >= 3, "index block too short");
        let index_entries = block.slice(1..block_len);
        let first_child = be::read_u16(&index_entries);
        // Index block body layout: [first_child: u16] [hash: u64, block: u16]*
        // Compute total key block references (first_child + N boundary entries)
        // using ceil division: (body_len - sizeof(first_child) + ENTRY_SIZE - 1) / ENTRY_SIZE + 1
        // simplified to (body_len + ENTRY_SIZE - 2) / ENTRY_SIZE
        let num_index_entries: usize = (index_entries.len() + INDEX_BLOCK_ENTRY_SIZE
            - size_of::<u16>())
            / INDEX_BLOCK_ENTRY_SIZE;

        let current_key_block =
            Self::parse_key_block(&file, &block_offsets, &meta, first_child, compression)?;
        Ok(StaticSortedFileIter {
            file,
            block_offsets,
            meta,
            index_entries,
            num_index_entries,
            index_pos: 1,
            current_key_block,
            value_block_cache: None,
            compression,
        })
    }

    /// Parses a key block at the given index, returning `RcBytes`-backed data.
    fn parse_key_block(
        file: &File,
        block_offsets: &BlockOffsets,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
        compression: Compression,
    ) -> Result<CurrentKeyBlock> {
        let block = read_block_iter(file, block_offsets, meta, block_index, compression)?;
        let data = &*block;
        ensure!(data.len() >= 4, "key block too short");
        let block_type = data[0];
        let entry_count = be::read_u24(&data[1..]);
        let block_len = block.len();
        let Some((layout, fixed)) = KeyBlockLayout::from_block_type(block_type) else {
            bail!("Invalid key block type: {block_type}");
        };
        let hash_len = layout.hash_len();

        let (kind, entries) = if fixed {
            ensure!(data.len() >= 6, "fixed key block too short");
            // In fixed blocks the size of the keys (<=32) is stored immediately after the block len
            // (retrieved above)
            let key_size = data[4] as usize;
            let FixedValueLayout {
                value_type,
                val_size,
                header_size,
            } = fixed_value_layout(data, data[5])?;
            let regions = FixedRegions::new(entry_count as usize, layout, key_size, val_size);
            let entries = block.slice(header_size..block_len);
            ensure!(
                entries.len() == regions.total_len(entry_count as usize),
                "fixed key block for {entry_count} entries is the wrong size"
            );
            (
                CurrentKeyBlockKind::Fixed {
                    value_type,
                    regions,
                },
                entries,
            )
        } else {
            let offset_table_begin = 4usize;
            let offset_table_end = 4 + (entry_count as usize) * key_block_table_stride(hash_len);
            ensure!(
                block_len >= offset_table_end,
                "key block too short for {entry_count} entries"
            );
            let offsets = block.clone().slice(offset_table_begin..offset_table_end);
            let entries = block.slice(offset_table_end..block_len);
            (CurrentKeyBlockKind::Variable { offsets }, entries)
        };

        // Compute the hash order if needed
        let hash_order = match layout {
            KeyBlockLayout::HashThenKey => None,
            KeyBlockLayout::KeyOnly => Some(hash_order_for_block(entry_count, |i| {
                kind.entry(&entries, entry_count, i, hash_len)
            })?),
        };

        Ok(CurrentKeyBlock {
            kind,
            layout,
            entries,
            entry_count,
            index: 0,
            hash_order,
        })
    }

    /// Gets the next entry in the file and moves the cursor.
    fn next_internal(&mut self) -> Result<Option<LookupEntry>> {
        loop {
            let kb = &mut self.current_key_block;
            if kb.index < kb.entry_count {
                let (precomputed_hash, index) = match &kb.hash_order {
                    None => (None, kb.index as usize),
                    Some(hash_order) => {
                        let HashOrderEntry { hash, entry_index } = hash_order[kb.index as usize];
                        (Some(hash), entry_index as usize)
                    }
                };
                let GetKeyEntryResult { hash, key, ty, val } =
                    kb.kind
                        .entry(&kb.entries, kb.entry_count, index, kb.layout.hash_len())?;
                let full_hash = match precomputed_hash {
                    Some(hash) => hash,
                    None => be::read_u64(hash),
                };
                let value = if ty == KEY_BLOCK_ENTRY_TYPE_MEDIUM {
                    let block = be::read_u16(val);
                    let (uncompressed_size, checksum, block) =
                        get_raw_block_iter(&self.file, &self.block_offsets, &self.meta, block)?;
                    IterValue::Medium {
                        uncompressed_size,
                        checksum,
                        block,
                    }
                } else {
                    handle_key_match_generic(
                        &self.meta,
                        ty,
                        val,
                        self.compression,
                        RcBlockCacheReader {
                            file: &self.file,
                            block_offsets: &self.block_offsets,
                            cache: &mut self.value_block_cache,
                        },
                    )?
                    .into()
                };
                let entry = LookupEntry {
                    hash: full_hash,
                    key: unsafe { kb.entries.slice_from_subslice(key) },
                    value,
                };
                kb.index += 1;
                return Ok(Some(entry));
            }
            if self.index_pos < self.num_index_entries {
                let base = self.index_pos * INDEX_BLOCK_ENTRY_SIZE;
                let block_index = be::read_u16(&self.index_entries[base..]);
                self.index_pos += 1;
                self.current_key_block = Self::parse_key_block(
                    &self.file,
                    &self.block_offsets,
                    &self.meta,
                    block_index,
                    self.compression,
                )?;
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

/// Computes `(key hash, entry index)` for every entry of a no-hash key block, in `(hash, key)`
/// order.
fn hash_order_for_block<'l>(
    entry_count: u32,
    get_entry: impl Fn(usize) -> Result<GetKeyEntryResult<'l>>,
) -> Result<Vec<HashOrderEntry>> {
    let mut order = Vec::with_capacity(entry_count as usize);
    for entry_index in 0..entry_count {
        let key = get_entry(entry_index as usize)?.key;
        order.push(HashOrderEntry {
            hash: crate::key::hash_key(&key),
            entry_index,
        });
    }
    // Stable sort by hash, stability is important to preserve the original hash order
    // This keeps tombstones in their correct relative positions.
    order.sort_by_key(|entry| entry.hash);
    Ok(order)
}

/// Compares a query against an entry, returning the ordering of the query relative to the entry in
/// the block's own sort order.
fn compare_hash_key<K: QueryKey>(
    layout: KeyBlockLayout,
    entry_hash: &[u8],
    entry_key: &[u8],
    full_hash: u64,
    query_key: &K,
) -> Ordering {
    match layout {
        KeyBlockLayout::KeyOnly => {
            debug_assert!(entry_hash.is_empty(), "KeyOnly entries carry no hash");
            query_key.cmp(entry_key)
        }
        KeyBlockLayout::HashThenKey => match full_hash.to_be_bytes()[..].cmp(entry_hash) {
            Ordering::Equal => query_key.cmp(entry_key),
            ord => ord,
        },
    }
}

/// Checks whether a query key names the same entry, used to walk a key group outward from a hit.
fn entry_matches_key<K: QueryKey>(
    layout: KeyBlockLayout,
    entry_hash: &[u8],
    entry_key: &[u8],
    full_hash: u64,
    query_key: &K,
) -> bool {
    match layout {
        KeyBlockLayout::KeyOnly => {
            debug_assert!(entry_hash.is_empty(), "KeyOnly entries carry no hash");
            query_key.eq(entry_key)
        }
        KeyBlockLayout::HashThenKey => {
            full_hash.to_be_bytes()[..] == *entry_hash && query_key.eq(entry_key)
        }
    }
}

/// Returns the byte size of the value portion for a given key block entry type.
///
/// The type byte comes from the file, so the two open-ended ranges are bounded here rather than
/// trusted: the writer only ever emits sizes up to [`MAX_INLINE_VALUE_SIZE`], and a value that
/// large is what lets a lookup return it inline. Rejecting an over-large tag keeps that a total
/// function — `B::from_inline` would otherwise be handed more bytes than it can hold.
fn entry_val_size(ty: u8) -> Result<usize> {
    match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => Ok(SMALL_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => Ok(MEDIUM_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_BLOB => Ok(BLOB_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED => Ok(KEY_DELETED_REF_SIZE),
        // Must precede the inline arm: both are open-ended and the tombstone range sits above it.
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN => {
            let size = (ty - KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN) as usize;
            ensure!(
                size <= MAX_INLINE_VALUE_SIZE,
                "key-value tombstone type {ty} claims a {size} byte value, over the \
                 {MAX_INLINE_VALUE_SIZE} byte maximum"
            );
            Ok(size)
        }
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
            let size = (ty - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as usize;
            ensure!(
                size <= MAX_INLINE_VALUE_SIZE,
                "inline value type {ty} claims a {size} byte value, over the \
                 {MAX_INLINE_VALUE_SIZE} byte maximum"
            );
            Ok(size)
        }
        _ => bail!("Invalid key block entry type: {ty}"),
    }
}

/// Reads the type and start offset from an offset table entry.
///
/// The trailing 4 bytes of every entry pack 1 byte of type into the top of a 3-byte BE offset.
/// `HashThenKey` entries carry the key's 8-byte hash ahead of that word — see
/// [`KEY_BLOCK_TABLE_ENTRY_SIZE_WITH_HASH`].
#[inline(always)]
fn read_offset_entry(
    offsets: &[u8],
    index: usize,
    table_stride: usize,
    hash_len: u8,
) -> (u8, usize) {
    // The offset word is last, so skip any hash that precedes it.
    let base = index * table_stride + (hash_len as usize);
    let word = be::read_u32(&offsets[base..]);
    let ty = (word >> 24) as u8;
    let offset = (word & 0x00FF_FFFF) as usize;
    (ty, offset)
}

/// Reads a key entry from a key block.
fn get_key_entry<'l>(
    offsets: &'l [u8],
    entries: &'l [u8],
    entry_count: usize,
    index: usize,
    hash_len: u8,
) -> Result<GetKeyEntryResult<'l>> {
    let table_stride = key_block_table_stride(hash_len);
    let (ty, start) = read_offset_entry(offsets, index, table_stride, hash_len);
    let end = if index == entry_count - 1 {
        entries.len()
    } else {
        let (_, next_start) = read_offset_entry(offsets, index + 1, table_stride, hash_len);
        next_start
    };
    // Hoisted into the table, so the search never reaches into the payload; empty for `KeyOnly`.
    let hash = &offsets[index * table_stride..index * table_stride + hash_len as usize];
    let val_size = entry_val_size(ty)?;
    Ok(GetKeyEntryResult {
        hash,
        key: &entries[start..end - val_size],
        ty,
        val: &entries[end - val_size..end],
    })
}

/// Reads a key entry from a fixed-size key block by direct indexing.
///
/// All entries have the same key size and value type, so positions are computed
/// arithmetically with no offset table indirection.
/// How a fixed-size key block encodes its entry values, decoded from the block header.
struct FixedValueLayout {
    /// The type shared by every entry, or `None` if each entry carries its own type byte.
    value_type: Option<u8>,
    /// Value bytes per entry, including any per-entry type byte.
    val_size: usize,
    /// Total header size, which the entry data follows.
    header_size: usize,
}

/// Decodes the value layout from a fixed-size key block header.
fn fixed_value_layout(block: &[u8], header_type: u8) -> Result<FixedValueLayout> {
    if header_type == FIXED_KEY_BLOCK_MIXED_VALUE_TYPE {
        // Mixed-type block: the value size follows the header's type byte, and each entry
        // carries its own type.
        ensure!(block.len() >= 7, "mixed-type fixed key block too short");
        // Validate the value footprint byte
        let value_footprint = be::read_u8(&block[6..]) as usize;
        ensure!(
            value_footprint <= MAX_INLINE_VALUE_SIZE,
            "mixed-type fixed key block claims a {value_footprint} byte value footprint, over the \
             {MAX_INLINE_VALUE_SIZE} byte maximum"
        );
        Ok(FixedValueLayout {
            value_type: None,
            // +1 for the per-entry type byte, which is part of the stride.
            val_size: value_footprint + 1,
            header_size: 7,
        })
    } else {
        Ok(FixedValueLayout {
            value_type: Some(header_type),
            val_size: entry_val_size(header_type)?,
            header_size: 6,
        })
    }
}

/// Where the two regions of a fixed-size key block sit, computed once per block.
///
/// A fixed block stores the bytes the binary search probes in a dense leading region and everything
/// else in a trailing region at the same entry index, so a probe touches one small stride rather
/// than a full interleaved entry.
///
/// This is the single owner of that geometry: the reader, the writer, and `sst_inspect` all derive
/// their offsets from here, so a change to which bytes go in the search region is made once. It is
/// the fixed-block counterpart to [`key_block_table_stride`] for variable-size blocks.
#[derive(Clone, Copy)]
pub struct FixedRegions {
    /// Which bytes the search region holds: the hash (`HashThenKey`) or the key (`KeyOnly`).
    layout: KeyBlockLayout,
    /// Bytes per entry in the search region.
    pub search_stride: usize,
    /// Offset of the tail region, relative to the start of the entry data.
    pub tail_start: usize,
    /// Bytes per entry in the tail region.
    pub tail_stride: usize,
    key_size: usize,
}

impl FixedRegions {
    /// `val_size` is the tail's per-entry value footprint: the value bytes plus the per-entry type
    /// byte of a mixed-type block. `fixed_value_layout` already folds that byte in; a caller
    /// computing it from a block header must add it itself.
    pub fn new(
        entry_count: usize,
        layout: KeyBlockLayout,
        key_size: usize,
        val_size: usize,
    ) -> Self {
        // `HashThenKey` searches the hashes and keeps the key with the value; `KeyOnly` has no
        // hash, so the key itself is the search region.
        let (search_stride, tail_stride) = match layout {
            KeyBlockLayout::HashThenKey => (layout.hash_len() as usize, key_size + val_size),
            KeyBlockLayout::KeyOnly => (key_size, val_size),
        };
        Self {
            layout,
            search_stride,
            tail_start: entry_count * search_stride,
            tail_stride,
            key_size,
        }
    }

    /// Bytes of a tail entry that precede its value: the key for `HashThenKey`, nothing for
    /// `KeyOnly`, which keeps its key in the search region.
    pub fn tail_key_size(&self) -> usize {
        match self.layout {
            KeyBlockLayout::HashThenKey => self.key_size,
            KeyBlockLayout::KeyOnly => 0,
        }
    }

    /// Total entry-data length implied by these regions, for bounds checking.
    pub fn total_len(&self, entry_count: usize) -> usize {
        self.tail_start + entry_count * self.tail_stride
    }
}

fn get_fixed_key_entry<'l>(
    entries: &'l [u8],
    index: usize,
    regions: FixedRegions,
    value_type: Option<u8>,
) -> Result<GetKeyEntryResult<'l>> {
    let FixedRegions {
        layout,
        search_stride,
        tail_start,
        tail_stride,
        key_size,
    } = regions;
    // The search region holds only what the binary search compares first: the hash for
    // `HashThenKey` blocks, the key for `KeyOnly` blocks. Everything else lives in the tail region
    // at the same entry index.
    let search = index * search_stride;
    let tail = tail_start + index * tail_stride;
    let (hash, key, tail_rest) = match layout {
        KeyBlockLayout::HashThenKey => (
            &entries[search..search + search_stride],
            &entries[tail..tail + key_size],
            tail + key_size,
        ),
        KeyBlockLayout::KeyOnly => (&entries[..0], &entries[search..search + key_size], tail),
    };
    // In a mixed-type block the entry's type byte precedes its value in the tail region.
    let (ty, val_start) = match value_type {
        Some(ty) => (ty, tail_rest),
        None => (be::read_u8(&entries[tail_rest..]), tail_rest + 1),
    };
    Ok(GetKeyEntryResult {
        hash,
        key,
        ty,
        val: &entries[val_start..tail + tail_stride],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `block_type` and `from_block_type` must be inverses over every layout and both entry
    /// sizings. This is what lets the writer and the readers agree: the writer picks a variant and
    /// encodes it, and each reader decodes the same variant back.
    #[test]
    fn block_type_round_trips() {
        for layout in [KeyBlockLayout::HashThenKey, KeyBlockLayout::KeyOnly] {
            for fixed in [false, true] {
                let byte = layout.block_type(fixed);
                assert_eq!(
                    KeyBlockLayout::from_block_type(byte),
                    Some((layout, fixed)),
                    "{layout:?} (fixed={fixed}) encoded as {byte} did not round-trip"
                );
            }
        }
    }

    /// The four key block types must be distinct, and must not collide with the index block type —
    /// a collision would silently route a key block into the index decoder or vice versa.
    #[test]
    fn block_types_are_distinct() {
        let mut seen = vec![BLOCK_TYPE_INDEX];
        for layout in [KeyBlockLayout::HashThenKey, KeyBlockLayout::KeyOnly] {
            for fixed in [false, true] {
                let byte = layout.block_type(fixed);
                assert!(!seen.contains(&byte), "block type {byte} is used twice");
                seen.push(byte);
            }
        }
        assert!(KeyBlockLayout::from_block_type(BLOCK_TYPE_INDEX).is_none());
    }

    /// Only `HashThenKey` stores hash bytes, and it stores exactly a `u64` of them. `get_key_entry`
    /// and `get_fixed_key_entry` both slice the entry using this length.
    #[test]
    fn hash_len_matches_layout() {
        assert_eq!(
            KeyBlockLayout::HashThenKey.hash_len() as usize,
            size_of::<u64>()
        );
        assert_eq!(KeyBlockLayout::KeyOnly.hash_len(), 0);
    }

    /// Only ranges that cross a page boundary are hinted, including a small block that straddles
    /// one, for both 4 KiB and 16 KiB pages.
    #[cfg(all(feature = "mmap", unix))]
    #[test]
    fn spans_multiple_pages_detects_page_crossings() {
        for page in [4096, 16384] {
            assert!(!spans_multiple_pages(&(0..page), page), "one full page");
            assert!(
                !spans_multiple_pages(&(page..page + 100), page),
                "inside a page"
            );
            assert!(spans_multiple_pages(&(0..page + 1), page), "one byte over");
            assert!(
                spans_multiple_pages(&(page - 8..page + 8), page),
                "straddles a boundary"
            );
            assert!(
                spans_multiple_pages(&(page / 2..3 * page), page),
                "several pages"
            );
        }
        // A 5 KiB block is one page at 16 KiB but two at 4 KiB.
        assert!(spans_multiple_pages(&(0..5120), 4096));
        assert!(!spans_multiple_pages(&(0..5120), 16384));
    }

    /// Reads the block-offset table of a file with `data_len` bytes of blocks followed by a table
    /// holding `ends`.
    fn read_offsets(ends: &[u32], data_len: usize) -> Result<BlockOffsets> {
        let mut bytes = vec![0u8; data_len];
        for end in ends {
            bytes.extend_from_slice(&end.to_be_bytes());
        }
        read_offsets_from(&bytes, ends.len())
    }

    /// Reads the block-offset table of `block_count` blocks from a file holding `bytes`.
    fn read_offsets_from(bytes: &[u8], block_count: usize) -> Result<BlockOffsets> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("00000007.sst");
        fs_err::write(&path, bytes)?;
        let file = File::open(&path)?;
        let meta = StaticSortedFileMetaData {
            sequence_number: 7,
            block_count: block_count.try_into()?,
        };
        BlockOffsets::read(&file, &meta, bytes.len())
    }

    #[test]
    fn block_offsets_ranges_use_previous_end_as_start() -> Result<()> {
        // A header-only first block, and offsets wider than one byte to exercise the big-endian
        // decode.
        let offsets = read_offsets(&[8, 300, 70_000], 70_000)?;
        assert_eq!(offsets.block_range(0)?, 0..8);
        assert_eq!(offsets.block_range(1)?, 8..300);
        assert_eq!(offsets.block_range(2)?, 300..70_000);
        assert!(offsets.block_range(3).is_err());
        Ok(())
    }

    #[test]
    fn block_offsets_reject_file_shorter_than_table() {
        let err = read_offsets_from(&[0; 8], 3).unwrap_err();
        assert!(err.to_string().contains("too short"), "{err:#}");
    }

    #[test]
    fn block_offsets_reject_block_shorter_than_header() {
        let err = read_offsets(&[12, 16, 40], 40).unwrap_err();
        assert!(err.to_string().contains("block 1"), "{err:#}");
    }

    #[test]
    fn block_offsets_reject_non_monotonic_offsets() {
        let err = read_offsets(&[20, 12, 40], 40).unwrap_err();
        assert!(err.to_string().contains("block 1"), "{err:#}");
    }

    /// A failed table read names the file, because `pread` goes through `fs_err`.
    #[test]
    fn block_offsets_read_error_names_the_file() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("00000007.sst");
        fs_err::write(&path, [0u8; 8])?;
        let file = File::open(&path)?;
        let meta = StaticSortedFileMetaData {
            sequence_number: 7,
            block_count: 1,
        };
        // Claim the file is longer than it is, so the size check passes but the read hits EOF.
        let err = BlockOffsets::read(&file, &meta, 16).unwrap_err();
        let message = format!("{err:#}");
        assert!(message.contains(&*path.to_string_lossy()), "{message}");
        Ok(())
    }

    #[test]
    fn block_offsets_reject_blocks_past_the_table() {
        let err = read_offsets(&[12, 40, 60], 52).unwrap_err();
        assert!(err.to_string().contains("past"), "{err:#}");
    }
}
