use std::{
    cmp::Ordering,
    fs::File,
    hash::BuildHasherDefault,
    path::Path,
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering as AtomicOrdering},
    },
};

use anyhow::{Context, Result, bail, ensure};
use memmap2::Mmap;
use quick_cache::sync::GuardResult;
use rustc_hash::FxHasher;
use smallvec::SmallVec;

use crate::{
    QueryKey,
    arc_bytes::ArcBytes,
    be,
    compression::checksum_block,
    constants::MAX_INLINE_VALUE_SIZE,
    lookup_entry::{IterValue, LookupEntry, LookupValue},
    mmap_helper::advise_mmap_for_persistence,
    rc_bytes::RcBytes,
    shared_bytes::SharedBytes,
    static_sorted_file_builder::{BLOCK_HEADER_SIZE, INDEX_BLOCK_ENTRY_SIZE},
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

pub type BlockCache =
    quick_cache::sync::Cache<(u32, u16), ArcBytes, BlockWeighter, BuildHasherDefault<FxHasher>>;

/// Trait abstracting value block reading for `handle_key_match_generic`.
///
/// Provides cached reads (small value blocks) and uncached reads (medium value
/// blocks). Generic over the byte type so it works for both the lookup path
/// (`ArcBytes` with `BlockCache`) and the iteration path (`RcBytes` with a
/// single-entry `Option` cache).
trait ValueBlockCache<B: SharedBytes> {
    fn get_or_read(
        self,
        mmap: &B::MmapHandle,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
    ) -> Result<B>;
}

/// Bundles the shared block cache with the per-file CRC-verified bitmap,
/// used on the lookup path.
#[derive(Clone, Copy)]
struct ArcBlockCacheReader<'a> {
    cache: &'a BlockCache,
    verified_blocks: &'a [AtomicU64],
}

/// Lookup-path: concurrent `BlockCache` with uncompressed-bypass and
/// once-per-block CRC verification via `verified_blocks` bitmap.
impl ValueBlockCache<ArcBytes> for ArcBlockCacheReader<'_> {
    fn get_or_read(
        self,
        mmap: &Arc<Mmap>,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
    ) -> Result<ArcBytes> {
        get_or_cache_block(mmap, meta, block_index, self.cache, self.verified_blocks)
    }
}

/// Iteration-path: lightweight single-entry cache for sequential reads.
impl ValueBlockCache<RcBytes> for &mut Option<(u16, RcBytes)> {
    fn get_or_read(
        self,
        mmap: &Rc<Mmap>,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
    ) -> Result<RcBytes> {
        if let Some((idx, block)) = self.as_ref()
            && *idx == block_index
        {
            return Ok(block.clone());
        }
        let block: RcBytes = read_block_generic(mmap, meta, block_index)?;
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
    /// One bit per block, set when that block's CRC has been verified at least once.
    /// Uncompressed (mmap-backed) blocks bypass the `BlockCache`, so without this
    /// bitmap the CRC would be re-computed on every access. `Relaxed` ordering
    /// suffices: racing first-time verifications are idempotent.
    verified_blocks: Box<[AtomicU64]>,
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
        let bitmap_words = (meta.block_count as usize).div_ceil(u64::BITS as usize);
        let verified_blocks = (0..bitmap_words)
            .map(|_| AtomicU64::new(0))
            .collect::<Box<[_]>>();
        Ok(Self {
            meta,
            mmap: Arc::new(mmap),
            verified_blocks,
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
        // There is exactly one index block per file (always the last block).
        // Read it first, then dispatch directly to the key block it points to.
        let index_block_index = self.meta.block_count - 1;
        let index_block = get_or_cache_block(
            &self.mmap,
            &self.meta,
            index_block_index,
            key_block_cache,
            &self.verified_blocks,
        )?;
        let key_block_index = self.lookup_index_block(&index_block, key_hash)?;

        let key_block_arc = get_or_cache_block(
            &self.mmap,
            &self.meta,
            key_block_index,
            key_block_cache,
            &self.verified_blocks,
        )?;
        let reader = ArcBlockCacheReader {
            cache: value_block_cache,
            verified_blocks: &self.verified_blocks,
        };
        let block_type = be::read_u8(&key_block_arc);
        match block_type {
            BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => {
                let has_hash = block_type == BLOCK_TYPE_KEY_WITH_HASH;
                self.lookup_key_block::<K, FIND_ALL>(key_block_arc, key_hash, key, has_hash, reader)
            }

            BLOCK_TYPE_FIXED_KEY_WITH_HASH | BLOCK_TYPE_FIXED_KEY_NO_HASH => {
                let has_hash = block_type == BLOCK_TYPE_FIXED_KEY_WITH_HASH;
                self.lookup_fixed_key_block::<K, FIND_ALL>(
                    key_block_arc,
                    key_hash,
                    key,
                    has_hash,
                    reader,
                )
            }
            _ => {
                bail!("Invalid block type");
            }
        }
    }

    /// Looks up a hash in a index block.
    fn lookup_index_block(&self, block: &[u8], hash: u64) -> Result<u16> {
        ensure!(block.len() >= 3, "index block too short");
        debug_assert!(
            be::read_u8(block) == BLOCK_TYPE_INDEX,
            "expected index block as last block"
        );
        let first_block = be::read_u16(&block[1..]);
        let (entries, remainder) = block[3..].as_chunks::<INDEX_BLOCK_ENTRY_SIZE>();
        if entries.is_empty() {
            return Ok(first_block);
        }
        if !remainder.is_empty() {
            bail!("invalid index block, {} extra bytes", remainder.len())
        }
        match entries.binary_search_by(|entry| be::read_u64(entry).cmp(&hash)) {
            Ok(i) => Ok(be::read_u16(&entries[i][8..])),
            Err(0) => Ok(first_block),
            Err(i) => Ok(be::read_u16(&entries[i - 1][8..])),
        }
    }

    /// Looks up a key in a key block and the value in a value block.
    ///
    /// If `FIND_ALL` is false, returns after finding the first match.
    /// If `FIND_ALL` is true, collects all entries with the same key.
    fn lookup_key_block<K: QueryKey, const FIND_ALL: bool>(
        &self,
        block: ArcBytes,
        key_hash: u64,
        key: &K,
        has_hash: bool,
        reader: ArcBlockCacheReader<'_>,
    ) -> Result<SstLookupResult> {
        let hash_len: u8 = if has_hash { 8 } else { 0 };
        ensure!(block.len() >= 4, "key block too short");
        let entry_count = be::read_u24(&block[1..]) as usize;
        let data = &block[4..];
        ensure!(
            data.len() >= entry_count * 4,
            "key block too short for {entry_count} entries"
        );
        let offsets = &data[..entry_count * 4];
        let entries = &data[entry_count * 4..];

        self.lookup_block_inner::<K, FIND_ALL>(&block, entry_count, key_hash, key, reader, |i| {
            get_key_entry(offsets, entries, entry_count, i, hash_len)
        })
    }

    /// Looks up a key in a fixed-size key block.
    ///
    /// Fixed-size key blocks store entries at predictable offsets (no offset table),
    /// enabling direct indexing during binary search.
    fn lookup_fixed_key_block<K: QueryKey, const FIND_ALL: bool>(
        &self,
        block: ArcBytes,
        key_hash: u64,
        key: &K,
        has_hash: bool,
        reader: ArcBlockCacheReader<'_>,
    ) -> Result<SstLookupResult> {
        let hash_len: u8 = if has_hash { 8 } else { 0 };
        ensure!(block.len() >= 6, "fixed key block too short");
        let entry_count = be::read_u24(&block[1..]) as usize;
        let key_size = be::read_u8(&block[4..]) as usize;
        let value_type = be::read_u8(&block[5..]);
        let val_size = entry_val_size(value_type)?;
        let stride = hash_len as usize + key_size + val_size;
        let entries = &block[6..];
        ensure!(
            entries.len() == entry_count * stride,
            "fixed key block for {entry_count} entries must is the wrong size"
        );

        self.lookup_block_inner::<K, FIND_ALL>(&block, entry_count, key_hash, key, reader, |i| {
            Ok(get_fixed_key_entry(
                entries, i, hash_len, key_size, value_type, stride,
            ))
        })
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

            let comparison = compare_hash_key(mid_hash, mid_key, key_hash, key);

            match comparison {
                Ordering::Less => r = m,
                Ordering::Equal => {
                    if !FIND_ALL {
                        // SingleValue mode: each key has exactly one entry
                        // this is enforced when writing
                        let result = self.handle_key_match(ty, val, block, reader)?;
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
                        results.push(self.handle_key_match(ty, val, block, reader)?);
                    }
                    // Technically we could `.reverse()` the items collected by the backwards
                    // scan, but the only ordering constraint we need to maintain for single
                    // sst multivalue reads is that a deleted token, if it exists comes last.
                    // Because all the backwards scan items are strictly before the found item
                    // we know they don't contain the _last_ item. So we don't care about
                    // their order.

                    // Add the entry at `m`
                    results.push(self.handle_key_match(ty, val, block, reader)?);
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
                        results.push(self.handle_key_match(ty, val, block, reader)?);
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
        reader: ArcBlockCacheReader<'_>,
    ) -> Result<LookupValue> {
        handle_key_match_generic(&self.mmap, &self.meta, ty, val, key_block_arc, reader)
    }
}

/// Gets a block from the cache, or reads it from the mmap and inserts it.
///
/// Reads the block header exactly once via `get_raw_block_slice` (which
/// includes all `strict_checks` bounds guards). Uncompressed blocks bypass
/// the cache — an mmap-backed `ArcBytes` is cheaper than a cache lookup.
/// Their CRC is verified at most once per file open, tracked by
/// `verified_blocks`. Compressed blocks are looked up in `cache`; on a
/// miss they are decompressed, CRC-verified, and inserted.
fn get_or_cache_block(
    mmap: &Arc<Mmap>,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
    cache: &BlockCache,
    verified_blocks: &[AtomicU64],
) -> Result<ArcBytes> {
    let (uncompressed_length, checksum, block_data) = get_raw_block_slice(mmap, meta, block_index)
        .with_context(|| {
            format!(
                "Failed to read raw block {} from {:08}.sst",
                block_index, meta.sequence_number
            )
        })?;

    if uncompressed_length == 0 {
        // Uncompressed: serve directly from mmap. Verify CRC only once per file open.
        verify_checksum_once(meta, block_data, checksum, block_index, verified_blocks)?;
        // SAFETY: block_data points into the mmap backing `mmap`.
        return Ok(unsafe { ArcBytes::from_mmap(mmap, block_data) });
    }

    // Compressed: check cache; decompress and insert on miss.
    Ok(
        match cache.get_value_or_guard(&(meta.sequence_number, block_index), None) {
            GuardResult::Value(block) => block,
            GuardResult::Guard(guard) => {
                // A cached block may have been evicted, so re-reading still
                // benefits from the bitmap to skip redundant CRC verification.
                verify_checksum_once(meta, block_data, checksum, block_index, verified_blocks)?;
                let block = ArcBytes::from_decompressed(uncompressed_length, block_data)
                    .with_context(|| {
                        format!(
                            "Failed to decompress block {} from {:08}.sst ({} bytes uncompressed)",
                            block_index, meta.sequence_number, uncompressed_length
                        )
                    })?;
                let _ = guard.insert(block.clone());
                block
            }
            GuardResult::Timeout => unreachable!(),
        },
    )
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
        be::read_u32(&mmap[offset - 4..]) as usize
    };
    let block_end = be::read_u32(&mmap[offset..]) as usize;
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
    ensure!(
        block_start + BLOCK_HEADER_SIZE <= block_end,
        "block {} header truncated in {:08}.sst",
        block_index,
        meta.sequence_number
    );
    let uncompressed_length = be::read_u32(&mmap[block_start..]);
    let checksum = be::read_u32(&mmap[block_start + 4..]);
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

/// Verifies a block's CRC using the `verified_blocks` bitmap to avoid redundant
/// work. In practice each block is verified once, but concurrent first-time
/// accesses may race and verify the same block more than once — this is harmless
/// since the check is deterministic and idempotent. Verification failures are
/// *not* recorded in the bitmap, so a corrupted block will be re-checked (and
/// fail again) on every access.
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

/// Returns `(uncompressed_length, checksum, block)` wrapping the raw on-disk
/// data as the given byte type. Generic over `ArcBytes`/`RcBytes`.
fn get_raw_block_generic<B: SharedBytes>(
    mmap: &B::MmapHandle,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
) -> Result<(u32, u32, B)> {
    let (uncompressed_length, checksum, block) = get_raw_block_slice(mmap, meta, block_index)?;
    // SAFETY: block points into mmap which backs the MmapHandle.
    Ok((uncompressed_length, checksum, unsafe {
        B::from_mmap(mmap, block)
    }))
}

/// Reads a block, decompresses if needed, and verifies its checksum.
/// Generic over the byte type (`ArcBytes` or `RcBytes`).
#[tracing::instrument(level = "info", name = "reading database block", skip_all)]
fn read_block_generic<B: SharedBytes>(
    mmap: &B::MmapHandle,
    meta: &StaticSortedFileMetaData,
    block_index: u16,
) -> Result<B> {
    let (uncompressed_length, expected_checksum, block) =
        get_raw_block_slice(mmap, meta, block_index).with_context(|| {
            format!(
                "Failed to read raw block {} from {:08}.sst",
                block_index, meta.sequence_number
            )
        })?;

    verify_checksum(meta, block, expected_checksum, block_index)?;

    if uncompressed_length == 0 {
        // SAFETY: callers guarantee block points into the mmap.
        return Ok(unsafe { B::from_mmap(mmap, block) });
    }

    let buffer = B::from_decompressed(uncompressed_length, block).with_context(|| {
        format!(
            "Failed to decompress block {} from {:08}.sst ({} bytes uncompressed)",
            block_index, meta.sequence_number, uncompressed_length
        )
    })?;
    Ok(buffer)
}

/// Handles a key match by resolving the value reference. Generic over byte type.
fn handle_key_match_generic<B: SharedBytes>(
    mmap: &B::MmapHandle,
    meta: &StaticSortedFileMetaData,
    ty: u8,
    val: &[u8],
    key_block: &B,
    reader: impl ValueBlockCache<B>,
) -> Result<LookupValue<B>> {
    Ok(match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => {
            let block = be::read_u16(val);
            let size = be::read_u16(&val[2..]) as usize;
            let position = be::read_u32(&val[4..]) as usize;
            let value = reader
                .get_or_read(mmap, meta, block)?
                .slice(position..position + size);
            LookupValue::Slice { value }
        }
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
            let block = be::read_u16(val);
            let value = read_block_generic(mmap, meta, block)?;
            LookupValue::Slice { value }
        }
        KEY_BLOCK_ENTRY_TYPE_BLOB => {
            let sequence_number = be::read_u32(val);
            LookupValue::Blob { sequence_number }
        }
        KEY_BLOCK_ENTRY_TYPE_DELETED => LookupValue::Deleted,
        _ => {
            // Inline value — val is already the correct slice
            // SAFETY: val points into key_block's data
            let value = unsafe { key_block.slice_from_subslice(val) };
            LookupValue::Slice { value }
        }
    })
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
    /// Total key block references in the index block (first_child + boundary entries).
    num_index_entries: usize,
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
        let block: RcBytes = read_block_generic(&mmap, &meta, root_block_index)?;
        let block_type = block[0];

        // The builder always writes an index block as the root block.
        if block_type != BLOCK_TYPE_INDEX {
            bail!("Root block must be an index block");
        }
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

        let current_key_block = Self::parse_key_block(&mmap, &meta, first_child)?;
        Ok(StaticSortedFileIter {
            mmap,
            meta,
            index_entries,
            num_index_entries,
            index_pos: 1,
            current_key_block,
            value_block_cache: None,
        })
    }

    /// Parses a key block at the given index, returning `RcBytes`-backed data.
    fn parse_key_block(
        mmap: &Rc<Mmap>,
        meta: &StaticSortedFileMetaData,
        block_index: u16,
    ) -> Result<CurrentKeyBlock> {
        let block: RcBytes = read_block_generic(mmap, meta, block_index)?;
        let data = &*block;
        ensure!(data.len() >= 4, "key block too short");
        let block_type = data[0];
        let entry_count = be::read_u24(&data[1..]);
        match block_type {
            BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => {
                let hash_len = if block_type == BLOCK_TYPE_KEY_WITH_HASH {
                    8
                } else {
                    0
                };
                let n = entry_count as usize;
                let offsets_range = 4..4 + n * 4;
                let entries_range = 4 + n * 4..block.len();
                let offsets = block.clone().slice(offsets_range);
                let entries = block.slice(entries_range);
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
                let key_size = data[4] as usize;
                let value_type = data[5];
                let val_size = entry_val_size(value_type)?;
                let stride = hash_len as usize + key_size + val_size;
                // Header is 6 bytes for fixed-size blocks
                let entries_range = 6..block.len();
                let entries = block.slice(entries_range);
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
                    be::read_u64(hash)
                };
                let value = if ty == KEY_BLOCK_ENTRY_TYPE_MEDIUM {
                    let block = be::read_u16(val);
                    let (uncompressed_size, checksum, block) =
                        get_raw_block_generic(&self.mmap, &self.meta, block)?;
                    IterValue::Medium {
                        uncompressed_size,
                        checksum,
                        block,
                    }
                } else {
                    handle_key_match_generic(
                        &self.mmap,
                        &self.meta,
                        ty,
                        val,
                        &kb.entries,
                        &mut self.value_block_cache,
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
    let word = be::read_u32(&offsets[base..]);
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
