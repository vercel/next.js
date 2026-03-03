use std::{
    borrow::Cow,
    collections::VecDeque,
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{BE, ByteOrder, WriteBytesExt};
use turbo_bincode::turbo_bincode_encode;

use crate::{
    compression::compress_into_buffer,
    constants::{MAX_INLINE_VALUE_SIZE, MAX_SMALL_VALUE_SIZE, MIN_SMALL_VALUE_BLOCK_SIZE},
    meta_file::{AmqfBincodeWrapper, MetaEntryFlags},
    static_sorted_file::{
        BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY_NO_HASH, BLOCK_TYPE_KEY_WITH_HASH,
        KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_DELETED, KEY_BLOCK_ENTRY_TYPE_INLINE_MIN,
        KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_SMALL,
    },
};

/// The maximum number of entries that should go into a single key block
const MAX_KEY_BLOCK_ENTRIES: usize = MAX_KEY_BLOCK_SIZE / KEY_BLOCK_ENTRY_META_OVERHEAD;
/// The maximum bytes that should go into a single key block
// Note this must fit into 3 bytes length
const MAX_KEY_BLOCK_SIZE: usize = 16 * 1024;
/// Overhead of bytes that should be counted for entries in a key block in addition to the key size.
/// This covers the worst case (small values):
/// - 1 byte type (key block header)
/// - 3 bytes position (key block header)
/// - 8 bytes hash (optional, but unknown at collection time)
/// - 2 bytes block index
/// - 2 bytes size
/// - 4 bytes position in block
const KEY_BLOCK_ENTRY_META_OVERHEAD: usize = 20;
/// The aimed false positive rate for the AMQF
const AMQF_FALSE_POSITIVE_RATE: f64 = 0.01;
/// Assumed average small value size for pre-allocation estimates.
/// Intentionally conservative (small values range from MAX_INLINE_VALUE_SIZE+1 to
/// MAX_SMALL_VALUE_SIZE = 4096): a low estimate over-counts value blocks, which is
/// preferable to under-allocating vectors.
const AVG_SMALL_VALUE_SIZE: usize = 64;

/// Safety margin for block index capacity estimation in
/// [`StreamingSstWriter::has_block_index_capacity`]. Accounts for rounding in the entry-count and
/// byte-size based estimates of pending key blocks.
const BLOCK_INDEX_CAPACITY_BUFFER: usize = 16;

/// Tracks the accumulated state of the current incomplete key block.
///
/// During streaming, this sits on [`StreamingSstWriter`] and tracks the tail of the resolved
/// prefix. Entries are added one at a time; when [`should_flush`](Self::should_flush) returns
/// `true`, the caller should flush the block and call [`reset`](Self::reset).
struct KeyBlockAccumulator {
    /// Accumulated byte size (keys + per-entry overhead) of entries in this block.
    size: usize,
    /// Number of entries accumulated so far.
    entry_count: usize,
    /// Maximum key length among accumulated entries (determines whether hashes are stored).
    max_key_len: usize,
    /// Hash of the most recently added entry (used to avoid splitting entries with equal hashes
    /// across blocks).
    last_hash: u64,
}

impl KeyBlockAccumulator {
    fn new() -> Self {
        Self {
            size: 0,
            entry_count: 0,
            max_key_len: 0,
            last_hash: 0,
        }
    }

    /// Records a new entry in the accumulator.
    fn add(&mut self, key_len: usize, key_hash: u64) {
        self.size += key_len + KEY_BLOCK_ENTRY_META_OVERHEAD;
        self.max_key_len = self.max_key_len.max(key_len);
        self.entry_count += 1;
        self.last_hash = key_hash;
    }

    /// Returns `true` if the block should be flushed before adding an entry with the given key
    /// length and hash. Returns `false` for empty blocks and when the next entry shares its hash
    /// with the current last entry (to avoid splitting equal-hash runs).
    fn should_flush(&self, next_key_len: usize, next_key_hash: u64) -> bool {
        if self.entry_count == 0 {
            return false;
        }
        let would_exceed_size =
            self.size + next_key_len + KEY_BLOCK_ENTRY_META_OVERHEAD > MAX_KEY_BLOCK_SIZE;
        let would_exceed_entries = self.entry_count >= MAX_KEY_BLOCK_ENTRIES;
        // Never split entries with the same hash across blocks.
        (would_exceed_size || would_exceed_entries) && self.last_hash != next_key_hash
    }

    /// Resets the accumulator for a new key block.
    fn reset(&mut self) {
        self.size = 0;
        self.entry_count = 0;
        self.max_key_len = 0;
        // last_hash is intentionally not reset -- it is overwritten on the next add() call.
    }
}

/// Determines whether to store the hash per entry based on max key length.
fn use_hash(max_key_len: usize) -> bool {
    max_key_len > 32
}

/// Trait for entries from that SST files can be created
pub trait Entry {
    /// Returns the hash of the key
    fn key_hash(&self) -> u64;
    /// Returns the length of the key
    fn key_len(&self) -> usize;
    /// Writes the key to a buffer
    fn write_key_to(&self, buf: &mut Vec<u8>);

    /// Returns the value
    fn value(&self) -> EntryValue<'_>;
}

impl<E: Entry> Entry for &E {
    fn key_hash(&self) -> u64 {
        (*self).key_hash()
    }
    fn key_len(&self) -> usize {
        (*self).key_len()
    }
    fn write_key_to(&self, buf: &mut Vec<u8>) {
        (*self).write_key_to(buf)
    }
    fn value(&self) -> EntryValue<'_> {
        (*self).value()
    }
}

/// Reference to a value
#[derive(Copy, Clone)]
pub enum EntryValue<'l> {
    /// Inline value stored directly in the key block.
    Inline { value: &'l [u8] },
    /// Small-sized value. They are stored in shared value blocks.
    Small { value: &'l [u8] },
    /// Medium-sized value. They are stored in their own value block.
    Medium { value: &'l [u8] },
    /// Medium-sized value. They are stored in their own value block. In the raw form as on disk.
    MediumRaw {
        /// The uncompressed size of the block data. `0` means the block is stored uncompressed
        /// (and thus the size is the `len` of the block)
        uncompressed_size: u32,
        block: &'l [u8],
    },
    /// Large-sized value. They are stored in a blob file.
    Large { blob: u32 },
    /// Tombstone. The value was removed.
    Deleted,
}

#[derive(Debug, Clone)]
pub struct StaticSortedFileBuilderMeta<'a> {
    /// The minimum hash of the keys in the SST file
    pub min_hash: u64,
    /// The maximum hash of the keys in the SST file
    pub max_hash: u64,
    /// The AMQF data
    pub amqf: Cow<'a, [u8]>,
    /// The number of blocks in the SST file
    pub block_count: u16,
    /// The file size of the SST file
    pub size: u64,
    /// The status flags for this SST file
    pub flags: MetaEntryFlags,
    /// The number of entries in the SST file
    pub entries: u64,
}

/// Writes an SST file from a pre-sorted slice of entries.
///
/// This is a convenience wrapper around [`StreamingSstWriter`] for callers that already have all
/// entries in memory.
// TODO: Consider adding a variant that takes ownership (Vec<E> or drain iterator)
// to free entry memory as blocks are written.
pub fn write_static_stored_file<E: Entry>(
    entries: &[E],
    file: &Path,
    flags: MetaEntryFlags,
) -> Result<(StaticSortedFileBuilderMeta<'static>, File)> {
    debug_assert!(entries.iter().map(|e| e.key_hash()).is_sorted());
    let mut writer = StreamingSstWriter::new(file, flags, entries.len() as u64)?;
    for entry in entries {
        writer.add(entry)?;
    }
    writer.close()
}

// ---------------------------------------------------------------------------
// Block I/O helpers (free functions for borrow-checker friendliness)
// ---------------------------------------------------------------------------

/// Writes a raw (already-formatted) block to the file. Returns the block index assigned.
///
/// `uncompressed_size` is the original uncompressed size of the block data, or `0` if the block
/// is stored uncompressed.
fn write_raw_block_to_file(
    file: &mut BufWriter<File>,
    block_offsets: &mut Vec<u32>,
    uncompressed_size: u32,
    block: &[u8],
) -> Result<u16> {
    let block_index: u16 = block_offsets
        .len()
        .try_into()
        .expect("Block index overflow");

    let len: u32 = (block.len() + 4).try_into().unwrap();
    let offset = block_offsets
        .last()
        .copied()
        .unwrap_or_default()
        .checked_add(len)
        .expect("Block offset overflow");
    block_offsets.push(offset);

    file.write_u32::<BE>(uncompressed_size)
        .context("Failed to write uncompressed size")?;
    file.write_all(block)
        .context("Failed to write block data")?;
    Ok(block_index)
}

/// Writes a block to the file, optionally compressing it. Returns the block index assigned.
fn write_block_to_file(
    file: &mut BufWriter<File>,
    compress_buffer: &mut Vec<u8>,
    block_offsets: &mut Vec<u32>,
    block: &[u8],
    try_compress: bool,
) -> Result<u16> {
    let (uncompressed_size, data_to_write): (u32, &[u8]) = if try_compress {
        compress_into_buffer(block, compress_buffer)?;
        // Same threshold as LevelDB/RocksDB: require at least 12.5% savings.
        if compress_buffer.len() < block.len() - (block.len() / 8) {
            (block.len().try_into().unwrap(), compress_buffer.as_slice())
        } else {
            (0, block)
        }
    } else {
        (0, block)
    };

    let result = write_raw_block_to_file(file, block_offsets, uncompressed_size, data_to_write);
    compress_buffer.clear();
    result
}

// ---------------------------------------------------------------------------
// StreamingSstWriter
// ---------------------------------------------------------------------------

/// Where a key entry's value lives (or will live once the small block flushes).
enum ValueRef {
    /// Value in a known small value block (already flushed).
    Small {
        block_index: u16,
        offset: u32,
        size: u16,
    },
    /// Value is in a small value block that hasn't been written yet. Will be resolved in-place
    /// to [`ValueRef::Small`] when the small block is flushed.
    PendingSmall {
        #[cfg(debug_assertions)]
        small_block_id: u16,
        offset: u32,
        size: u16,
    },
    /// Medium value already written to its own block.
    Medium { block_index: u16 },
    /// Inline value (stored directly in the key block).
    Inline {
        data: [u8; MAX_INLINE_VALUE_SIZE],
        len: u8,
    },
    /// Large blob stored externally.
    Blob { blob_id: u32 },
    /// Tombstone.
    Deleted,
}

struct PendingEntry<E> {
    entry: E,
    value_ref: ValueRef,
}

/// A streaming SST file writer that writes blocks to disk incrementally.
///
/// Instead of materializing all entries in memory and then writing all value blocks followed by all
/// key blocks, this writer interleaves block writes as entries arrive. Medium values are written
/// immediately, small values are accumulated into blocks, and key blocks are flushed as soon as
/// their value references are all resolved.
///
/// The SST reader is block-index-addressed (not file-position-addressed), so interleaving block
/// types is fully compatible.
pub struct StreamingSstWriter<E: Entry> {
    // File I/O. Wrapped in Option so close() can take ownership without a partial-move
    // compile error (partial moves are forbidden when the type has a Drop impl).
    file: Option<BufWriter<File>>,
    compress_buffer: Vec<u8>,
    block_offsets: Vec<u32>,

    /// Pending key entries waiting to be flushed as key blocks.
    ///
    /// Entries are appended at the back and drained from the front once flushed.
    ///
    /// ```text
    ///  Resolved entries              Unresolved entries
    ///  (value block index known)     (PendingSmall references)
    /// |------------------------------|--------------------------|
    /// 0                     first_pending_small_index         len()
    ///
    ///  ^-- current_key_block tracks      ^-- these wait for
    ///      the incomplete tail block         flush_small_value_block()
    ///      within this region                to resolve them
    /// ```
    ///
    /// [`advance_boundary_to`](Self::advance_boundary_to) scans the resolved prefix, flushes
    /// complete key blocks from the front, and drains them. When a small value block is flushed,
    /// all `PendingSmall` entries are resolved in-place and the boundary advances to `len()`.
    ///
    /// **Unbounded growth note:** If a small number of small values appear early, followed by
    /// many medium/inline values, the queue grows because the front entries block on the
    /// unflushed small value block while the back keeps accepting resolved entries.
    pending_keys: VecDeque<PendingEntry<E>>,

    /// Index into `pending_keys` of the first entry that has a `PendingSmall` reference for the
    /// current (unflushed) small value block. All entries before this index are fully resolved
    /// (their value block indices are known). Equals `pending_keys.len()` when no pending small
    /// entries exist.
    first_pending_small_index: usize,

    /// The current small_block_id being accumulated into (debug-only consistency check).
    #[cfg(debug_assertions)]
    current_small_block_id: u16,

    // Pending small value block buffer.
    pending_small_value_block: Vec<u8>,

    // Reusable buffer for building key blocks
    key_buffer: Vec<u8>,

    // AMQF filter (built incrementally). Wrapped in Option for the same reason as `file`.
    filter: Option<qfilter::Filter>,

    // Index block data: (first_hash, block_index) for each key block written
    key_block_boundaries: Vec<(u64, u16)>,

    // Metadata
    min_hash: u64,
    max_hash: u64,
    entry_count: u64,
    flags: MetaEntryFlags,

    // Fullness tracking (for compaction callers)
    total_key_size: usize,
    total_value_size: usize,

    /// Total byte size of keys in `pending_keys` (for block capacity estimation).
    pending_key_total_size: usize,

    /// State of the current incomplete key block at the tail of the resolved prefix.
    current_key_block: KeyBlockAccumulator,

    /// Set to `true` by `close()` so the Drop guard can detect writers dropped without closing.
    #[cfg(debug_assertions)]
    finished: bool,
}

impl<E: Entry> StreamingSstWriter<E> {
    /// Creates a new streaming SST writer.
    ///
    /// `max_entry_count` is used to size the AMQF filter. It must be an upper bound on the number
    /// of entries that will be added; the filter is not resizable. A slightly oversized value only
    /// improves the false-positive rate.
    pub fn new(file: &Path, flags: MetaEntryFlags, max_entry_count: u64) -> Result<Self> {
        let file = BufWriter::new(File::create(file)?);
        let filter = qfilter::Filter::new(max_entry_count.max(1), AMQF_FALSE_POSITIVE_RATE)
            .expect("Filter can't be constructed");

        // Estimate number of key blocks based on max entry count.
        // Each key block holds up to MAX_KEY_BLOCK_ENTRIES entries.
        let estimated_key_blocks = (max_entry_count as usize)
            .div_ceil(MAX_KEY_BLOCK_ENTRIES)
            .max(1);
        // Estimate value blocks assuming all entries are small values of average size.
        // Each small value block holds ~MIN_SMALL_VALUE_BLOCK_SIZE / AVG_SMALL_VALUE_SIZE entries.
        let entries_per_value_block = MIN_SMALL_VALUE_BLOCK_SIZE / AVG_SMALL_VALUE_SIZE;
        let estimated_value_blocks = (max_entry_count as usize)
            .div_ceil(entries_per_value_block)
            .max(1);
        let estimated_total_blocks = estimated_key_blocks + estimated_value_blocks + 1;

        Ok(Self {
            file: Some(file),
            compress_buffer: Vec::with_capacity(MIN_SMALL_VALUE_BLOCK_SIZE + MAX_SMALL_VALUE_SIZE),
            block_offsets: Vec::with_capacity(estimated_total_blocks),
            pending_keys: VecDeque::with_capacity(entries_per_value_block),
            first_pending_small_index: 0,
            #[cfg(debug_assertions)]
            current_small_block_id: 0,
            pending_small_value_block: Vec::with_capacity(
                MIN_SMALL_VALUE_BLOCK_SIZE + MAX_SMALL_VALUE_SIZE,
            ),
            key_buffer: Vec::with_capacity(MAX_KEY_BLOCK_SIZE),
            filter: Some(filter),
            key_block_boundaries: Vec::with_capacity(estimated_key_blocks),
            min_hash: u64::MAX,
            max_hash: 0,
            entry_count: 0,
            flags,
            total_key_size: 0,
            total_value_size: 0,
            pending_key_total_size: 0,
            current_key_block: KeyBlockAccumulator::new(),
            #[cfg(debug_assertions)]
            finished: false,
        })
    }

    /// Returns true if the SST file has reached capacity limits.
    ///
    /// This is intended for compaction callers that need to split output across multiple SST files.
    pub fn is_full(&self, max_entries: usize, max_data_size: usize) -> bool {
        self.entry_count as usize >= max_entries
            || self.total_key_size + self.total_value_size >= max_data_size
            || !self.has_block_index_capacity()
    }

    /// Returns true if the SST file has room for more blocks without overflowing the `u16` block
    /// index. Uses the exact count of blocks already written plus a conservative estimate of
    /// blocks still needed for pending entries and the index.
    fn has_block_index_capacity(&self) -> bool {
        let blocks_written = self.block_offsets.len();
        // Blocks still needed:
        // - 1 pending small value block (if buffer is non-empty)
        // - key blocks for pending entries (upper bound from both entry count and byte size)
        // - 1 index block
        let pending_small_block = usize::from(!self.pending_small_value_block.is_empty());
        let pending_key_blocks = self
            .pending_keys
            .len()
            .div_ceil(MAX_KEY_BLOCK_ENTRIES)
            .max(self.pending_key_total_size.div_ceil(MAX_KEY_BLOCK_SIZE))
            .max(1);
        let index_block = 1;
        let buffer = BLOCK_INDEX_CAPACITY_BUFFER;
        blocks_written + pending_small_block + pending_key_blocks + index_block + buffer
            < u16::MAX as usize
    }

    /// Adds an entry to the SST file. Entries must be added in (key-hash, key) order.
    pub fn add(&mut self, entry: E) -> Result<()> {
        let key_hash = entry.key_hash();
        let key_len = entry.key_len();

        // Update metadata
        if self.entry_count == 0 {
            self.min_hash = key_hash;
        }
        self.max_hash = key_hash;
        self.entry_count += 1;

        // Insert into AMQF
        self.filter
            .as_mut()
            .unwrap()
            .insert_fingerprint(false, key_hash)
            .expect("AMQF insert failed");

        // Track key size for fullness and block capacity
        self.total_key_size += key_len;
        self.pending_key_total_size += key_len;

        // Route value
        let value_ref = match entry.value() {
            EntryValue::Medium { value } => {
                self.total_value_size += value.len();
                let block_index = write_block_to_file(
                    self.file.as_mut().unwrap(),
                    &mut self.compress_buffer,
                    &mut self.block_offsets,
                    value,
                    true,
                )
                .context("Failed to write value block")?;
                ValueRef::Medium { block_index }
            }
            EntryValue::MediumRaw {
                uncompressed_size,
                block,
            } => {
                // Note: tracks compressed block size (not uncompressed) unlike EntryValue::Medium.
                // Both are acceptable approximations of disk usage for is_full() thresholds.
                self.total_value_size += block.len();
                let block_index = write_raw_block_to_file(
                    self.file.as_mut().unwrap(),
                    &mut self.block_offsets,
                    uncompressed_size,
                    block,
                )
                .context("Failed to write compressed value block")?;
                ValueRef::Medium { block_index }
            }
            EntryValue::Small { value } => {
                self.total_value_size += value.len();

                let offset = self.pending_small_value_block.len() as u32;
                let size: u16 = value.len().try_into().unwrap();
                self.pending_small_value_block.extend_from_slice(value);

                // Track where the first PendingSmall entry is in the queue
                if self.first_pending_small_index >= self.pending_keys.len() {
                    self.first_pending_small_index = self.pending_keys.len();
                }

                let value_ref = ValueRef::PendingSmall {
                    #[cfg(debug_assertions)]
                    small_block_id: self.current_small_block_id,
                    offset,
                    size,
                };

                self.push_pending_key_entry(entry, value_ref);

                // Eagerly flush the small block AFTER pushing the new entry. This resolves
                // the just-pushed entry immediately via advance_boundary_to(), so key blocks
                // can be flushed incrementally.
                if self.pending_small_value_block.len() >= MIN_SMALL_VALUE_BLOCK_SIZE {
                    self.flush_small_value_block()?;
                }

                return Ok(());
            }
            EntryValue::Inline { value } => {
                debug_assert!(value.len() <= MAX_INLINE_VALUE_SIZE);
                let mut data = [0u8; MAX_INLINE_VALUE_SIZE];
                data[..value.len()].copy_from_slice(value);
                ValueRef::Inline {
                    data,
                    len: value.len() as u8,
                }
            }
            EntryValue::Large { blob } => ValueRef::Blob { blob_id: blob },
            EntryValue::Deleted => ValueRef::Deleted,
        };

        self.push_pending_key_entry(entry, value_ref);
        self.try_flush_key_blocks()
    }

    /// Appends a new entry to the pending-keys queue.
    fn push_pending_key_entry(&mut self, entry: E, value_ref: ValueRef) {
        self.pending_keys
            .push_back(PendingEntry { entry, value_ref });
    }

    /// Advances `first_pending_small_index` past the just-pushed entry if it is resolved and
    /// sits right at the current boundary. Flushes complete key blocks incrementally.
    ///
    /// Must be called immediately after [`push_pending_key_entry`] with a resolved
    /// (non-`PendingSmall`) entry.
    fn try_flush_key_blocks(&mut self) -> Result<()> {
        debug_assert!(!matches!(
            self.pending_keys.back().unwrap().value_ref,
            ValueRef::PendingSmall { .. }
        ));
        if self.first_pending_small_index != self.pending_keys.len() - 1 {
            // Boundary is blocked by earlier unresolved PendingSmall entries.
            return Ok(());
        }
        self.advance_boundary_to(self.pending_keys.len())
    }

    /// Advances the resolved boundary from its current position to `new_boundary`,
    /// incrementally tracking key block sizes and flushing complete key blocks.
    ///
    /// All entries in `pending_keys[self.first_pending_small_index..new_boundary]`
    /// must have resolved (non-`PendingSmall`) value references.
    fn advance_boundary_to(&mut self, new_boundary: usize) -> Result<()> {
        let mut last_flushed_end = 0usize;
        // Cumulative key sizes of all entries visited so far, and the snapshot at the last
        // flush point. The difference at the end gives the total key size of drained entries.
        let mut cumulative_key_size = 0usize;
        let mut flushed_key_size = 0usize;

        for i in self.first_pending_small_index..new_boundary {
            let entry = &self.pending_keys[i];
            let key_len = entry.entry.key_len();
            let key_hash = entry.entry.key_hash();

            if self.current_key_block.should_flush(key_len, key_hash) {
                let block_end = last_flushed_end + self.current_key_block.entry_count;
                self.flush_key_block(
                    last_flushed_end,
                    block_end,
                    self.current_key_block.max_key_len,
                )?;
                flushed_key_size = cumulative_key_size;
                last_flushed_end = block_end;
                self.current_key_block.reset();
            }

            cumulative_key_size += key_len;
            self.current_key_block.add(key_len, key_hash);
        }

        if last_flushed_end > 0 {
            self.pending_key_total_size -= flushed_key_size;
            self.pending_keys.drain(..last_flushed_end);
        }

        self.first_pending_small_index = new_boundary - last_flushed_end;
        Ok(())
    }

    /// Flushes the current pending small value block to disk and resolves all `PendingSmall`
    /// entries in-place.
    fn flush_small_value_block(&mut self) -> Result<()> {
        // Early return if empty -- this simplifies trailing small value block handling in
        // `close()` where we call this unconditionally.
        if self.pending_small_value_block.is_empty() {
            return Ok(());
        }

        let block_index = write_block_to_file(
            self.file.as_mut().unwrap(),
            &mut self.compress_buffer,
            &mut self.block_offsets,
            &self.pending_small_value_block,
            true,
        )
        .context("Failed to write small value block")?;

        // Resolve all PendingSmall entries for this block in-place.
        // Only scan from first_pending_small_index -- entries before it are guaranteed
        // already resolved (from previous flush calls).
        #[cfg(debug_assertions)]
        let flushed_id = self.current_small_block_id;
        for i in self.first_pending_small_index..self.pending_keys.len() {
            let entry = &mut self.pending_keys[i];
            if let ValueRef::PendingSmall {
                #[cfg(debug_assertions)]
                small_block_id,
                offset,
                size,
            } = entry.value_ref
            {
                #[cfg(debug_assertions)]
                debug_assert_eq!(
                    small_block_id, flushed_id,
                    "all pending small entries must reference the small value block that was just \
                     written"
                );
                entry.value_ref = ValueRef::Small {
                    block_index,
                    offset,
                    size,
                };
            }
        }

        // All PendingSmall entries are now resolved. Advance the boundary through all of
        // them, flushing key blocks incrementally as we go.
        self.advance_boundary_to(self.pending_keys.len())?;

        // Advance to next small block id (debug-only consistency check)
        #[cfg(debug_assertions)]
        {
            self.current_small_block_id += 1;
        }
        self.pending_small_value_block.clear();

        Ok(())
    }

    /// Flushes a single key block from `pending_keys[start..end]`.
    fn flush_key_block(&mut self, start: usize, end: usize, max_key_len: usize) -> Result<()> {
        let entry_count = end - start;
        let has_hash = use_hash(max_key_len);

        self.key_buffer.clear();
        let mut builder = KeyBlockBuilder::new(&mut self.key_buffer, entry_count as u32, has_hash);

        for i in start..end {
            let pending = &self.pending_keys[i];
            match pending.value_ref {
                ValueRef::Small {
                    block_index,
                    offset,
                    size,
                } => {
                    builder.put_small(&pending.entry, block_index, offset, size, has_hash);
                }
                ValueRef::Medium { block_index } => {
                    builder.put_medium(&pending.entry, block_index, has_hash);
                }
                ValueRef::Inline { data, len } => {
                    builder.put_inline(&pending.entry, &data[..len as usize], has_hash);
                }
                ValueRef::Blob { blob_id } => {
                    builder.put_blob(&pending.entry, blob_id, has_hash);
                }
                ValueRef::Deleted => {
                    builder.delete(&pending.entry, has_hash);
                }
                ValueRef::PendingSmall { .. } => {
                    unreachable!("PendingSmall should have been resolved");
                }
            }
        }

        // Drop builder to release borrow on key_buffer before writing
        builder.finish();

        // Record boundary
        let first_hash = self.pending_keys[start].entry.key_hash();
        let block_index = write_block_to_file(
            self.file.as_mut().unwrap(),
            &mut self.compress_buffer,
            &mut self.block_offsets,
            &self.key_buffer,
            true,
        )
        .context("Failed to write key block")?;
        self.key_block_boundaries.push((first_hash, block_index));

        Ok(())
    }

    /// Finishes writing the SST file. Flushes remaining blocks, writes the index, and returns
    /// metadata.
    pub fn close(mut self) -> Result<(StaticSortedFileBuilderMeta<'static>, File)> {
        #[cfg(debug_assertions)]
        {
            self.finished = true;
        }

        // Flush remaining small value block (even if under MIN_SMALL_VALUE_BLOCK_SIZE).
        self.flush_small_value_block()?;

        // Now all PendingSmall entries are resolved. Flush all remaining key blocks.
        self.flush_remaining_key_blocks()?;

        assert!(
            !self.key_block_boundaries.is_empty(),
            "StreamingSstWriter::close() called with no entries"
        );

        let mut file = self.file.take().unwrap();

        // Write index block directly to file (index blocks are never compressed).
        let index_entry_count: u16 = (self.key_block_boundaries.len() - 1)
            .try_into()
            .expect("Index entries count overflow");
        let index_block_size: u32 = (INDEX_BLOCK_HEADER_SIZE
            + index_entry_count as usize * INDEX_BLOCK_ENTRY_SIZE)
            .try_into()
            .unwrap();
        // Register block offset (uncompressed_size = 0 since we store raw).
        {
            let block_len = index_block_size + 4; // +4 for the uncompressed_size header
            let offset = self
                .block_offsets
                .last()
                .copied()
                .unwrap_or_default()
                .checked_add(block_len)
                .expect("Block offset overflow");
            self.block_offsets.push(offset);
        }
        file.write_u32::<BE>(0)
            .context("Failed to write index block header")?;
        let first_block = self.key_block_boundaries[0].1;
        let mut index_block = IndexBlockBuilder::new(&mut file, first_block);
        for &(hash, block) in &self.key_block_boundaries[1..] {
            index_block.put(hash, block);
        }

        // Write block offset table
        for offset in &self.block_offsets {
            file.write_u32::<BE>(*offset)
                .context("Failed to write block offset")?;
        }

        let block_count: u16 = self
            .block_offsets
            .len()
            .try_into()
            .expect("Block count overflow");

        // Shrink the AMQF filter to the actual entry count. The filter was created with
        // `max_entry_count` which may be larger than the number of entries actually added.
        let mut filter = self.filter.take().unwrap();
        filter.shrink_to_fit();

        // Serialize AMQF
        let amqf =
            turbo_bincode_encode(&AmqfBincodeWrapper(filter)).expect("AMQF serialization failed");

        // Compute file size from block offsets rather than calling stream_position()
        // (which requires a flush + seek).
        let last_block_end = self.block_offsets.last().copied().unwrap_or_default() as u64;
        let offset_table_size = block_count as u64 * size_of::<u32>() as u64;
        let file_size = last_block_end + offset_table_size;

        let meta = StaticSortedFileBuilderMeta {
            min_hash: self.min_hash,
            max_hash: self.max_hash,
            amqf: Cow::Owned(amqf.into_vec()),
            block_count,
            size: file_size,
            flags: self.flags,
            entries: self.entry_count,
        };

        Ok((meta, file.into_inner()?))
    }

    /// Flushes all remaining entries as key blocks. Called from `close()` after all small value
    /// blocks have been flushed, so all PendingSmall entries are resolved.
    ///
    /// This loop mirrors [`advance_boundary_to`], but uses a local accumulator (since the
    /// `self.current_key_block` state is stale) and flushes the final incomplete block
    /// (unlike `advance_boundary_to`, which keeps it for more entries during streaming).
    fn flush_remaining_key_blocks(&mut self) -> Result<()> {
        if self.pending_keys.is_empty() {
            return Ok(());
        }

        // After flush_small_value_block() in close(), no PendingSmall entries should remain.
        // first_pending_small_index may be non-zero (when all entries are medium/inline/etc
        // and advance_boundary_to was never called), but it must equal pending_keys.len(),
        // meaning no entries after the boundary exist.
        debug_assert_eq!(
            self.first_pending_small_index,
            self.pending_keys.len(),
            "expected no unresolved PendingSmall entries after flush_small_value_block"
        );

        let total = self.pending_keys.len();
        let mut block_start = 0;
        let mut acc = KeyBlockAccumulator::new();

        for i in 0..total {
            let entry = &self.pending_keys[i];
            let key_len = entry.entry.key_len();
            let key_hash = entry.entry.key_hash();

            if acc.should_flush(key_len, key_hash) {
                self.flush_key_block(block_start, i, acc.max_key_len)?;
                block_start = i;
                acc.reset();
            }

            acc.add(key_len, key_hash);
        }

        // Flush the final block
        if block_start < total {
            self.flush_key_block(block_start, total, acc.max_key_len)?;
        }

        // Free VecDeque memory. Numeric fields are not reset because close() consumes self.
        self.pending_keys.clear();
        Ok(())
    }
}

#[cfg(debug_assertions)]
impl<E: Entry> Drop for StreamingSstWriter<E> {
    fn drop(&mut self) {
        // Skip assertion during panic unwinding to avoid a double-panic (which would abort).
        if !std::thread::panicking() {
            assert!(
                self.finished || self.entry_count == 0,
                "StreamingSstWriter dropped without calling close()"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// KeyBlockBuilder
// ---------------------------------------------------------------------------

/// Builder for a single key block.
///
/// Entries are added via `put_*` methods which write key data and value references into the buffer.
/// The block format uses a fixed-size header table followed by variable-length entry data.
struct KeyBlockBuilder<'l> {
    current_entry: usize,
    header_size: usize,
    buffer: &'l mut Vec<u8>,
}

/// The size of the key block header (block type + entry count).
const KEY_BLOCK_HEADER_SIZE: usize = 4;

impl<'l> KeyBlockBuilder<'l> {
    /// Creates a new key block builder for the number of entries.
    fn new(buffer: &'l mut Vec<u8>, entry_count: u32, has_hash: bool) -> Self {
        debug_assert!(entry_count < (1 << 24));

        const ESTIMATED_KEY_SIZE: usize = 16;
        buffer.reserve(entry_count as usize * ESTIMATED_KEY_SIZE);
        let block_type = if has_hash {
            BLOCK_TYPE_KEY_WITH_HASH
        } else {
            BLOCK_TYPE_KEY_NO_HASH
        };
        buffer.write_u8(block_type).unwrap();
        buffer.write_u24::<BE>(entry_count).unwrap();
        for _ in 0..entry_count {
            buffer.write_u32::<BE>(0).unwrap();
        }
        Self {
            current_entry: 0,
            header_size: buffer.len(),
            buffer,
        }
    }

    /// Writes the 8-byte hash from a raw u64 if `has_hash` is true.
    fn write_hash(&mut self, hash: u64, has_hash: bool) {
        if has_hash {
            self.buffer.extend_from_slice(&hash.to_be_bytes());
        }
    }

    /// Writes the entry header (position + type) for the current entry.
    fn write_entry_header(&mut self, entry_type: u8) {
        let pos = self.buffer.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((entry_type as u32) << 24);
        BE::write_u32(&mut self.buffer[header_offset..header_offset + 4], header);
    }

    /// Writes the hash and key from an entry.
    fn write_entry_key<E: Entry>(&mut self, entry: &E, has_hash: bool) {
        self.write_hash(entry.key_hash(), has_hash);
        entry.write_key_to(self.buffer);
    }

    /// Writes a small-sized value entry.
    fn put_small<E: Entry>(
        &mut self,
        entry: &E,
        value_block: u16,
        value_offset: u32,
        value_size: u16,
        has_hash: bool,
    ) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_SMALL);
        self.write_entry_key(entry, has_hash);
        self.buffer.write_u16::<BE>(value_block).unwrap();
        self.buffer.write_u16::<BE>(value_size).unwrap();
        self.buffer.write_u32::<BE>(value_offset).unwrap();
        self.current_entry += 1;
    }

    /// Writes a medium-sized value entry.
    fn put_medium<E: Entry>(&mut self, entry: &E, value_block: u16, has_hash: bool) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_MEDIUM);
        self.write_entry_key(entry, has_hash);
        self.buffer.write_u16::<BE>(value_block).unwrap();
        self.current_entry += 1;
    }

    /// Writes a tombstone entry.
    fn delete<E: Entry>(&mut self, entry: &E, has_hash: bool) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_DELETED);
        self.write_entry_key(entry, has_hash);
        self.current_entry += 1;
    }

    /// Writes a blob value entry.
    fn put_blob<E: Entry>(&mut self, entry: &E, blob_id: u32, has_hash: bool) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_BLOB);
        self.write_entry_key(entry, has_hash);
        self.buffer.write_u32::<BE>(blob_id).unwrap();
        self.current_entry += 1;
    }

    /// Writes an inline value entry.
    fn put_inline<E: Entry>(&mut self, entry: &E, value: &[u8], has_hash: bool) {
        debug_assert!(value.len() <= MAX_INLINE_VALUE_SIZE);
        let entry_type = KEY_BLOCK_ENTRY_TYPE_INLINE_MIN + value.len() as u8;
        self.write_entry_header(entry_type);
        self.write_entry_key(entry, has_hash);
        self.buffer.extend_from_slice(value);
        self.current_entry += 1;
    }

    /// Returns the key block buffer.
    fn finish(self) -> &'l mut Vec<u8> {
        self.buffer
    }
}

// ---------------------------------------------------------------------------
// IndexBlockBuilder
// ---------------------------------------------------------------------------

/// Builder for a single index block.
struct IndexBlockBuilder<W: Write> {
    writer: W,
}

/// Size of a single index block entry (u64 hash + u16 block index).
const INDEX_BLOCK_ENTRY_SIZE: usize = size_of::<u64>() + size_of::<u16>();

/// Size of the index block header (u8 type + u16 first_block).
const INDEX_BLOCK_HEADER_SIZE: usize = size_of::<u8>() + size_of::<u16>();

impl<W: Write> IndexBlockBuilder<W> {
    /// Creates a new builder for an index block with the specified number of entries and a pointer
    /// to the first block.
    fn new(mut writer: W, first_block: u16) -> Self {
        writer.write_u8(BLOCK_TYPE_INDEX).unwrap();
        writer.write_u16::<BE>(first_block).unwrap();
        Self { writer }
    }

    /// Adds a hash boundary to the index block.
    fn put(&mut self, hash: u64, block: u16) {
        self.writer.write_u64::<BE>(hash).unwrap();
        self.writer.write_u16::<BE>(block).unwrap();
    }
}

#[cfg(test)]
mod tests {
    use std::hash::BuildHasherDefault;

    use quick_cache::sync::Cache;
    use rustc_hash::FxHasher;

    use super::*;
    use crate::{
        key::hash_key,
        lookup_entry::LookupValue,
        static_sorted_file::{
            BlockWeighter, SstLookupResult, StaticSortedFile, StaticSortedFileMetaData,
        },
    };

    type TestBlockCache =
        Cache<(u32, u16), crate::ArcBytes, BlockWeighter, BuildHasherDefault<FxHasher>>;

    fn make_cache() -> TestBlockCache {
        TestBlockCache::with(
            100,
            4 * 1024 * 1024,
            Default::default(),
            Default::default(),
            Default::default(),
        )
    }

    /// A simple entry type for testing with configurable value type.
    struct TestEntry {
        key: Vec<u8>,
        hash: u64,
        value_kind: TestValueKind,
    }

    enum TestValueKind {
        Inline(Vec<u8>),
        Small(Vec<u8>),
        Medium(Vec<u8>),
        /// Already-formatted block with `uncompressed_size = 0` (stored as-is).
        MediumRaw(Vec<u8>),
        Blob(u32),
        Deleted,
    }

    impl TestEntry {
        fn new(key: &[u8], value_kind: TestValueKind) -> Self {
            let key = key.to_vec();
            let hash = hash_key(&key);
            Self {
                key,
                hash,
                value_kind,
            }
        }

        fn small(key: &[u8], value: &[u8]) -> Self {
            Self::new(key, TestValueKind::Small(value.to_vec()))
        }

        fn inline(key: &[u8], value: &[u8]) -> Self {
            debug_assert!(value.len() <= MAX_INLINE_VALUE_SIZE);
            Self::new(key, TestValueKind::Inline(value.to_vec()))
        }

        fn medium(key: &[u8], value: &[u8]) -> Self {
            Self::new(key, TestValueKind::Medium(value.to_vec()))
        }

        fn blob(key: &[u8], blob_id: u32) -> Self {
            Self::new(key, TestValueKind::Blob(blob_id))
        }

        fn deleted(key: &[u8]) -> Self {
            Self::new(key, TestValueKind::Deleted)
        }

        fn medium_raw(key: &[u8], value: &[u8]) -> Self {
            Self::new(key, TestValueKind::MediumRaw(value.to_vec()))
        }

        fn expected_value(&self) -> Option<&[u8]> {
            match &self.value_kind {
                TestValueKind::Inline(v)
                | TestValueKind::Small(v)
                | TestValueKind::Medium(v)
                | TestValueKind::MediumRaw(v) => Some(v),
                _ => None,
            }
        }
    }

    impl Entry for TestEntry {
        fn key_hash(&self) -> u64 {
            self.hash
        }

        fn key_len(&self) -> usize {
            self.key.len()
        }

        fn write_key_to(&self, buf: &mut Vec<u8>) {
            buf.extend_from_slice(&self.key);
        }

        fn value(&self) -> EntryValue<'_> {
            match &self.value_kind {
                TestValueKind::Inline(v) => EntryValue::Inline { value: v },
                TestValueKind::Small(v) => EntryValue::Small { value: v },
                TestValueKind::Medium(v) => EntryValue::Medium { value: v },
                TestValueKind::MediumRaw(v) => EntryValue::MediumRaw {
                    // uncompressed_size = 0 means the block is stored as-is (no compression).
                    uncompressed_size: 0,
                    block: v,
                },
                TestValueKind::Blob(id) => EntryValue::Large { blob: *id },
                TestValueKind::Deleted => EntryValue::Deleted,
            }
        }
    }

    /// Sort entries by hash (required by SST writer).
    fn sort_entries(entries: &mut [TestEntry]) {
        entries.sort_by_key(|e| e.hash);
    }

    /// Open an SST file for lookup given a path and metadata.
    fn open_sst(
        dir: &Path,
        seq: u32,
        meta: &StaticSortedFileBuilderMeta<'_>,
    ) -> Result<StaticSortedFile> {
        StaticSortedFile::open(
            dir,
            StaticSortedFileMetaData {
                sequence_number: seq,
                block_count: meta.block_count,
            },
        )
    }

    /// Helper: write entries via StreamingSstWriter, return meta.
    fn write_sst(
        dir: &Path,
        seq: u32,
        entries: &[TestEntry],
        flags: MetaEntryFlags,
    ) -> Result<StaticSortedFileBuilderMeta<'static>> {
        let sst_path = dir.join(format!("{seq:08}.sst"));
        let mut writer = StreamingSstWriter::new(&sst_path, flags, entries.len() as u64)?;
        for entry in entries {
            writer.add(entry)?;
        }
        let (meta, _file) = writer.close()?;
        Ok(meta)
    }

    /// Lookup a key in an SST file and assert it matches the expected value kind.
    fn assert_lookup(
        sst: &StaticSortedFile,
        entry: &TestEntry,
        kc: &TestBlockCache,
        vc: &TestBlockCache,
    ) -> Result<()> {
        let result = sst.lookup::<_, false>(entry.hash, &entry.key, kc, vc)?;
        match (&entry.value_kind, result) {
            (_, SstLookupResult::Found(values))
                if values.len() == 1 && matches!(values[0], LookupValue::Slice { .. }) =>
            {
                let LookupValue::Slice { value } = &values[0] else {
                    unreachable!()
                };
                let expected = entry
                    .expected_value()
                    .expect("Got Slice but entry has no value");
                assert_eq!(
                    value.as_ref(),
                    expected,
                    "value mismatch for key {:?}",
                    std::str::from_utf8(&entry.key)
                );
            }
            (TestValueKind::Blob(expected_id), SstLookupResult::Found(values))
                if values.len() == 1 && matches!(values[0], LookupValue::Blob { .. }) =>
            {
                let LookupValue::Blob { sequence_number } = &values[0] else {
                    unreachable!()
                };
                assert_eq!(*sequence_number, *expected_id);
            }
            (TestValueKind::Deleted, SstLookupResult::Found(values))
                if values.len() == 1 && matches!(values[0], LookupValue::Deleted) => {}
            _ => {
                panic!(
                    "Unexpected lookup result for key {:?}",
                    std::str::from_utf8(&entry.key)
                );
            }
        }
        Ok(())
    }

    #[test]
    fn single_inline_entry() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let mut entries = vec![TestEntry::inline(b"key1", b"val1")];
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, 1);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        assert_lookup(&sst, &entries[0], &kc, &vc)?;
        Ok(())
    }

    #[test]
    fn single_small_entry() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let value = vec![0xAB; 100]; // > MAX_INLINE_VALUE_SIZE, <= MAX_SMALL_VALUE_SIZE
        let mut entries = vec![TestEntry::small(b"skey", &value)];
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, 1);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        assert_lookup(&sst, &entries[0], &kc, &vc)?;
        Ok(())
    }

    #[test]
    fn single_medium_entry() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let value = vec![0xCD; 8192]; // > MAX_SMALL_VALUE_SIZE
        let mut entries = vec![TestEntry::medium(b"mkey", &value)];
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, 1);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        assert_lookup(&sst, &entries[0], &kc, &vc)?;
        Ok(())
    }

    #[test]
    fn single_blob_entry() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let mut entries = vec![TestEntry::blob(b"bkey", 42)];
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, 1);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        assert_lookup(&sst, &entries[0], &kc, &vc)?;
        Ok(())
    }

    #[test]
    fn single_deleted_entry() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let mut entries = vec![TestEntry::deleted(b"dkey")];
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, 1);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        assert_lookup(&sst, &entries[0], &kc, &vc)?;
        Ok(())
    }

    #[test]
    fn many_small_values() -> Result<()> {
        let dir = tempfile::tempdir()?;
        // Create enough small entries to trigger multiple small value block flushes.
        // MIN_SMALL_VALUE_BLOCK_SIZE = 8KB, each value is 200 bytes -> ~40 entries per block.
        let count = 200;
        let mut entries: Vec<TestEntry> = (0..count)
            .map(|i| {
                let key = format!("key-{i:04}");
                let value = vec![(i & 0xFF) as u8; 200];
                TestEntry::small(key.as_bytes(), &value)
            })
            .collect();
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, count as u64);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();

        for entry in &entries {
            assert_lookup(&sst, entry, &kc, &vc)?;
        }
        Ok(())
    }

    #[test]
    fn many_medium_values() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let count = 50;
        let mut entries: Vec<TestEntry> = (0..count)
            .map(|i| {
                let key = format!("mkey-{i:04}");
                let value = vec![(i & 0xFF) as u8; 8192];
                TestEntry::medium(key.as_bytes(), &value)
            })
            .collect();
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, count as u64);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();

        for entry in &entries {
            assert_lookup(&sst, entry, &kc, &vc)?;
        }
        Ok(())
    }

    #[test]
    fn mixed_value_types() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let mut entries = vec![
            TestEntry::inline(b"a-inline", b"tiny"),
            TestEntry::small(b"b-small", &[0x11; 200]),
            TestEntry::medium(b"c-medium", &[0x22; 8192]),
            TestEntry::blob(b"d-blob", 99),
            TestEntry::deleted(b"e-deleted"),
            TestEntry::small(b"f-small2", &[0x33; 300]),
            TestEntry::inline(b"g-inline2", b"mini"),
            TestEntry::medium(b"h-medium2", &[0x44; 16384]),
        ];
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, 8);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();

        for entry in &entries {
            assert_lookup(&sst, entry, &kc, &vc)?;
        }
        Ok(())
    }

    #[test]
    fn is_full_entry_count_limit() {
        let dir = tempfile::tempdir().unwrap();
        let sst_path = dir.path().join("test.sst");
        let mut writer =
            StreamingSstWriter::new(&sst_path, MetaEntryFlags::default(), 100).unwrap();

        let max_entries = 50;
        for i in 0..max_entries {
            let key = format!("k{i:06}");
            let entry = TestEntry::inline(key.as_bytes(), &[0; 4]);
            writer.add(entry).unwrap();
        }

        assert_eq!(writer.entry_count, max_entries as u64);
        assert!(
            writer.is_full(max_entries, usize::MAX),
            "Should be full when entry count reaches max_entries"
        );
        assert!(
            !writer.is_full(max_entries + 1, usize::MAX),
            "Should not be full when limit is higher"
        );
        writer.close().unwrap();
    }

    #[test]
    fn is_full_data_size_limit() {
        let dir = tempfile::tempdir().unwrap();
        let sst_path = dir.path().join("test.sst");
        let mut writer =
            StreamingSstWriter::new(&sst_path, MetaEntryFlags::default(), 100).unwrap();

        let value = vec![0u8; 1000];
        for i in 0..10 {
            let key = format!("k{i:06}");
            let entry = TestEntry::small(key.as_bytes(), &value);
            writer.add(entry).unwrap();
        }

        let total = writer.total_key_size + writer.total_value_size;
        assert!(total > 10_000, "total data should exceed 10KB");
        assert!(writer.is_full(usize::MAX, total - 1));
        assert!(!writer.is_full(usize::MAX, total + 1));
        writer.close().unwrap();
    }

    #[test]
    fn write_static_stored_file_matches_streaming() -> Result<()> {
        let dir = tempfile::tempdir()?;

        let mut entries: Vec<TestEntry> = (0..100)
            .map(|i| {
                let key = format!("rkey-{i:04}");
                if i % 3 == 0 {
                    TestEntry::inline(key.as_bytes(), &[(i & 0xFF) as u8; 4])
                } else if i % 3 == 1 {
                    TestEntry::small(key.as_bytes(), &[(i & 0xFF) as u8; 200])
                } else {
                    TestEntry::medium(key.as_bytes(), &[(i & 0xFF) as u8; 8192])
                }
            })
            .collect();
        sort_entries(&mut entries);

        // Write via convenience function
        let batch_path = dir.path().join("00000001.sst");
        let (meta1, _) =
            write_static_stored_file(&entries, &batch_path, MetaEntryFlags::default())?;

        // Write via streaming API
        let streaming_path = dir.path().join("00000002.sst");
        let mut writer = StreamingSstWriter::new(
            &streaming_path,
            MetaEntryFlags::default(),
            entries.len() as u64,
        )?;
        for entry in &entries {
            writer.add(entry)?;
        }
        let (meta2, _) = writer.close()?;

        // Metadata should match
        assert_eq!(meta1.entries, meta2.entries);
        assert_eq!(meta1.min_hash, meta2.min_hash);
        assert_eq!(meta1.max_hash, meta2.max_hash);
        assert_eq!(meta1.block_count, meta2.block_count);

        // Both files should produce the same lookup results
        let sst1 = StaticSortedFile::open(
            dir.path(),
            StaticSortedFileMetaData {
                sequence_number: 1,
                block_count: meta1.block_count,
            },
        )?;
        let sst2 = StaticSortedFile::open(
            dir.path(),
            StaticSortedFileMetaData {
                sequence_number: 2,
                block_count: meta2.block_count,
            },
        )?;
        let kc = make_cache();
        let vc = make_cache();

        for entry in &entries {
            let r1 = sst1.lookup::<_, false>(entry.hash, &entry.key, &kc, &vc)?;
            let r2 = sst2.lookup::<_, false>(entry.hash, &entry.key, &kc, &vc)?;
            match (&r1, &r2) {
                (SstLookupResult::Found(v1), SstLookupResult::Found(v2))
                    if v1.len() == 1 && v2.len() == 1 =>
                {
                    match (&v1[0], &v2[0]) {
                        (
                            LookupValue::Slice { value: val1 },
                            LookupValue::Slice { value: val2 },
                        ) => {
                            assert_eq!(
                                val1.as_ref(),
                                val2.as_ref(),
                                "Value mismatch for key {:?}",
                                std::str::from_utf8(&entry.key)
                            );
                        }
                        (LookupValue::Deleted, LookupValue::Deleted) => {}
                        (
                            LookupValue::Blob {
                                sequence_number: s1,
                            },
                            LookupValue::Blob {
                                sequence_number: s2,
                            },
                        ) => {
                            assert_eq!(s1, s2);
                        }
                        _ => panic!(
                            "Mismatched results for key {:?}",
                            std::str::from_utf8(&entry.key)
                        ),
                    }
                }
                _ => panic!(
                    "Mismatched results for key {:?}",
                    std::str::from_utf8(&entry.key)
                ),
            }
        }
        Ok(())
    }

    #[test]
    #[should_panic(expected = "StreamingSstWriter::close() called with no entries")]
    fn close_empty_writer_panics() {
        let dir = tempfile::tempdir().unwrap();
        let sst_path = dir.path().join("empty.sst");
        let writer =
            StreamingSstWriter::<TestEntry>::new(&sst_path, MetaEntryFlags::default(), 0).unwrap();
        writer.close().unwrap();
    }

    #[test]
    fn key_block_boundary_at_max_entries() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let count = MAX_KEY_BLOCK_ENTRIES + 1;
        let mut entries: Vec<TestEntry> = (0..count)
            .map(|i| {
                let key = format!("boundary-{i:06}");
                TestEntry::inline(key.as_bytes(), &[0u8; 4])
            })
            .collect();
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, count as u64);
        // count > MAX_KEY_BLOCK_ENTRIES so we need at least 2 key blocks plus 1 index block
        assert!(
            meta.block_count >= 3,
            "expected at least 2 key blocks + 1 index block"
        );

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        for entry in &entries {
            assert_lookup(&sst, entry, &kc, &vc)?;
        }
        Ok(())
    }

    #[test]
    fn single_medium_raw_entry() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let value = vec![0xBE; 8192];
        let mut entries = vec![TestEntry::medium_raw(b"rkey", &value)];
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        assert_eq!(meta.entries, 1);

        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        assert_lookup(&sst, &entries[0], &kc, &vc)?;
        Ok(())
    }
}
