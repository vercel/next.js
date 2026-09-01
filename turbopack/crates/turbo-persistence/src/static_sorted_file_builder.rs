use std::{
    borrow::Cow,
    collections::VecDeque,
    io::{BufWriter, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{BE, ByteOrder, WriteBytesExt};
use fs_err::File;

use crate::{
    compression::{checksum_block, compress_into_buffer},
    constants::{MAX_INLINE_VALUE_SIZE, MAX_SMALL_VALUE_SIZE, MIN_SMALL_VALUE_BLOCK_SIZE},
    meta_file::MetaEntryFlags,
    static_sorted_file::{
        BLOB_VALUE_REF_SIZE, BLOCK_TYPE_INDEX, FIXED_KEY_BLOCK_MIXED_VALUE_TYPE,
        KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_INLINE_MIN,
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED, KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN,
        KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_SMALL, KEY_DELETED_REF_SIZE,
        KeyBlockLayout, MEDIUM_VALUE_REF_SIZE, SMALL_VALUE_REF_SIZE,
    },
};

/// Size of the per-block header on disk: 4 bytes uncompressed_size + 4 bytes CRC32 checksum.
pub const BLOCK_HEADER_SIZE: usize = 8;

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

/// Minimum key size (in bytes) for attempting LZ4 compression on key blocks.
///
/// For small keys (below this threshold), compression is unlikely to find enough to work with and
/// only wastes CPU time, so we skip the attempt entirely.
const MIN_KEY_SIZE_FOR_COMPRESSION: usize = 16;

/// Maximum key length that can use fixed-size key block layout.
///
/// The on-disk fixed-key header stores the key size as a single byte, so keys longer than this
/// fall back to variable-size layout.
const MAX_FIXED_KEY_LEN: usize = u8::MAX as usize;

/// Maximum value size that can use fixed-size key block layout.
///
/// Mixed-type fixed blocks store the value size in a single header byte, since it can no longer be
/// derived from a single shared entry type.
const MAX_FIXED_VAL_SIZE: usize = u8::MAX as usize;

/// Newtype for the key block entry type byte.
///
/// This encodes what kind of value reference an entry has (small, medium, blob, deleted, or
/// inline with embedded length). See `KEY_BLOCK_ENTRY_TYPE_*` constants.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct EntryType(u8);

/// Tracks whether a key block's entries are uniform enough for fixed-size layout.
///
/// Fixed layout needs a uniform *stride*, which requires a uniform key length and a uniform value
/// size. A uniform value *type* is a stronger condition that additionally lets the type be hoisted
/// into the block header; when types differ but sizes agree, the type is stored per entry instead
/// (1 byte, still cheaper than the 4-byte offset table entry a variable block would need).
///
/// State transitions:
/// - `Unknown` → first entry → `Fixed`
/// - `Fixed` + matching key_len and value type → stays `Fixed`
/// - `Fixed` + matching key_len and value *size* → `Fixed` with `value_type: None`
/// - `Fixed` + mismatched key_len or value size → `Variable`
/// - `Variable` → stays `Variable`
#[derive(Clone, Copy)]
enum KeyBlockFormat {
    /// No entries yet — format undetermined.
    Unknown,
    /// All entries so far have uniform key length and value size.
    Fixed {
        key_len: u8,
        val_size: u8,
        /// The shared entry type, or `None` if entries have differing types of the same size.
        value_type: Option<EntryType>,
    },
    /// Entries have mixed key lengths or value sizes; must use offset table.
    Variable,
}

impl KeyBlockFormat {
    /// Updates the format after seeing an entry with the given key length and value type.
    ///
    /// A `Fixed` state is only reachable when all entries have matching key length and value size,
    /// and the key length fits in a u8 (required by the on-disk header).
    fn update(&mut self, key_len: usize, value_type: EntryType) {
        let val_size = value_type_val_size(value_type);
        *self = match *self {
            KeyBlockFormat::Unknown => {
                if key_len <= MAX_FIXED_KEY_LEN && val_size <= MAX_FIXED_VAL_SIZE {
                    KeyBlockFormat::Fixed {
                        key_len: key_len as u8,
                        val_size: val_size as u8,
                        value_type: Some(value_type),
                    }
                } else {
                    KeyBlockFormat::Variable
                }
            }
            KeyBlockFormat::Fixed {
                key_len: k,
                val_size: s,
                value_type: v,
            } if k as usize == key_len && s as usize == val_size => KeyBlockFormat::Fixed {
                key_len: k,
                val_size: s,
                // Collapse to `None` as soon as two entries disagree on type.
                value_type: v.filter(|v| *v == value_type),
            },
            KeyBlockFormat::Fixed { .. } | KeyBlockFormat::Variable => KeyBlockFormat::Variable,
        };
    }
}

/// Copy-able snapshot of the accumulator state needed by [`flush_key_block`].
#[derive(Clone, Copy)]
struct KeyBlockFlushInfo {
    max_key_len: usize,
    min_key_len: usize,
    format: KeyBlockFormat,
}

impl KeyBlockFlushInfo {
    /// The shared key length when every entry in the block has the same one, else `None`.
    fn uniform_key_len(&self) -> Option<usize> {
        (self.min_key_len == self.max_key_len).then_some(self.max_key_len)
    }
}

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
    min_key_len: usize,
    /// Hash of the most recently added entry (used to avoid splitting entries with equal hashes
    /// across blocks).
    last_hash: u64,
    /// Whether the block qualifies for fixed-size layout.
    format: KeyBlockFormat,
}

impl KeyBlockAccumulator {
    fn new() -> Self {
        Self {
            size: 0,
            entry_count: 0,
            max_key_len: 0,
            min_key_len: usize::MAX,
            last_hash: 0,
            format: KeyBlockFormat::Unknown,
        }
    }

    /// Records a new entry in the accumulator.
    fn add(&mut self, key_len: usize, key_hash: u64, value_type: EntryType) {
        self.size += key_len + KEY_BLOCK_ENTRY_META_OVERHEAD;
        self.max_key_len = self.max_key_len.max(key_len);
        self.min_key_len = self.min_key_len.min(key_len);
        self.entry_count += 1;
        self.last_hash = key_hash;
        self.format.update(key_len, value_type);
    }

    /// Snapshots the state needed by `flush_key_block`.
    fn flush_info(&self) -> KeyBlockFlushInfo {
        KeyBlockFlushInfo {
            max_key_len: self.max_key_len,
            min_key_len: self.min_key_len,
            format: self.format,
        }
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
        self.min_key_len = usize::MAX;
        self.format = KeyBlockFormat::Unknown;
        // last_hash is intentionally not reset -- it is overwritten on the next add() call.
    }
}

/// Chooses a key block's layout from the longest key it holds.
fn choose_layout(max_key_len: usize) -> KeyBlockLayout {
    // Short keys are cheap enough to compare directly that storing an 8-byte hash per entry costs
    // more space than the comparison saves, so those blocks omit it and reorder entries by key.
    if max_key_len > 32 {
        KeyBlockLayout::HashThenKey
    } else {
        KeyBlockLayout::KeyOnly
    }
}

#[inline]
fn be_key_u32(key: &[u8]) -> u32 {
    u32::from_be_bytes(key.try_into().expect("4-byte key"))
}

#[inline]
fn be_key_u64(key: &[u8]) -> u64 {
    u64::from_be_bytes(key.try_into().expect("8-byte key"))
}

/// Trait for entries from that SST files can be created
pub trait Entry {
    /// Returns the hash of the key
    fn key_hash(&self) -> u64;
    /// Returns the length of the key
    fn key_len(&self) -> usize;
    /// Returns the key's bytes.
    fn key_bytes(&self) -> &[u8];
    /// Writes the key to a buffer
    fn write_key_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(self.key_bytes());
    }

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
    fn key_bytes(&self) -> &[u8] {
        (*self).key_bytes()
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
        /// CRC32 checksum of the on-disk block data (after compression).
        checksum: u32,
        block: &'l [u8],
    },
    /// Large-sized value. They are stored in a blob file.
    Large { blob: u32 },
    /// Tombstone. The value was removed.
    KeyDeleted,
    /// Key-value tombstone. Only the one carried value was removed; other values for the same key
    /// survive. MultiValue families only. The value must be at most [`MAX_INLINE_VALUE_SIZE`]
    /// bytes.
    KeyValueDeleted { value: &'l [u8] },
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
    checksum: u32,
    block: &[u8],
) -> Result<u16> {
    let block_index: u16 = block_offsets
        .len()
        .try_into()
        .expect("Block index overflow");

    let len: u32 = (block.len() + BLOCK_HEADER_SIZE).try_into().unwrap();
    let offset = block_offsets
        .last()
        .copied()
        .unwrap_or_default()
        .checked_add(len)
        .expect("Block offset overflow");
    block_offsets.push(offset);

    file.write_u32::<BE>(uncompressed_size)
        .context("Failed to write uncompressed size")?;
    file.write_u32::<BE>(checksum)
        .context("Failed to write checksum")?;
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

    // Checksum is computed on the on-disk data (after compression).
    let checksum = checksum_block(data_to_write);

    let result = write_raw_block_to_file(
        file,
        block_offsets,
        uncompressed_size,
        checksum,
        data_to_write,
    );
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
    KeyDeleted,
    /// Key-value tombstone: deletes only the carried value from the key's group. The value is
    /// stored inline, exactly like [`ValueRef::Inline`].
    KeyValueDeleted {
        data: [u8; MAX_INLINE_VALUE_SIZE],
        len: u8,
    },
}

impl ValueRef {
    /// Returns the key block entry type for this value reference.
    fn entry_type(&self) -> EntryType {
        EntryType(match self {
            ValueRef::Small { .. } | ValueRef::PendingSmall { .. } => KEY_BLOCK_ENTRY_TYPE_SMALL,
            ValueRef::Medium { .. } => KEY_BLOCK_ENTRY_TYPE_MEDIUM,
            ValueRef::Inline { len, .. } => KEY_BLOCK_ENTRY_TYPE_INLINE_MIN + *len,
            ValueRef::Blob { .. } => KEY_BLOCK_ENTRY_TYPE_BLOB,
            ValueRef::KeyDeleted => KEY_BLOCK_ENTRY_TYPE_KEY_DELETED,
            ValueRef::KeyValueDeleted { len, .. } => {
                KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN + *len
            }
        })
    }

    /// Writes the value bytes for this reference to a buffer.
    ///
    /// This is the shared serialization logic used by both variable-size and fixed-size key block
    /// builders.
    fn write_value_to(&self, buffer: &mut Vec<u8>) {
        match self {
            ValueRef::Small {
                block_index,
                offset,
                size,
            } => {
                let mut scratch = [0u8; 8];
                BE::write_u16(&mut scratch, *block_index);
                BE::write_u16(&mut scratch[2..], *size);
                BE::write_u32(&mut scratch[4..], *offset);
                buffer.extend(&scratch);
            }
            ValueRef::Medium { block_index } => {
                let mut scratch = [0u8; 2];
                BE::write_u16(&mut scratch, *block_index);
                buffer.extend(scratch);
            }
            ValueRef::Inline { data, len } => {
                buffer.extend(&data[..*len as usize]);
            }
            ValueRef::Blob { blob_id } => {
                let mut scratch = [0u8; 4];
                BE::write_u32(&mut scratch, *blob_id);
                buffer.extend(scratch);
            }
            ValueRef::KeyDeleted => { /* no value bytes */ }
            ValueRef::KeyValueDeleted { data, len } => {
                buffer.extend(&data[..*len as usize]);
            }
            ValueRef::PendingSmall { .. } => {
                unreachable!("PendingSmall should have been resolved");
            }
        }
    }
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

    // Collected key hashes truncated to u32 for deferred AMQF construction via sorted Builder
    // in close(). Fingerprint size is always <32 bits, so the lower 32 bits suffice.
    collected_fingerprints: Vec<u32>,

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
    /// `max_entry_count` is used to pre-allocate buffers and estimate block counts.
    pub fn new(file: &Path, flags: MetaEntryFlags, max_entry_count: u64) -> Result<Self> {
        let file = BufWriter::new(File::create(file)?);

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
            collected_fingerprints: Vec::with_capacity(max_entry_count as usize),
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

        // Collect hash for deferred AMQF construction in close()
        self.collected_fingerprints.push(key_hash as u32);

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
                checksum,
                block,
            } => {
                // Note: tracks compressed block size (not uncompressed) unlike EntryValue::Medium.
                // Both are acceptable approximations of disk usage for is_full() thresholds.
                self.total_value_size += block.len();
                let block_index = write_raw_block_to_file(
                    self.file.as_mut().unwrap(),
                    &mut self.block_offsets,
                    uncompressed_size,
                    checksum,
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
            EntryValue::KeyDeleted => ValueRef::KeyDeleted,
            EntryValue::KeyValueDeleted { value } => {
                // Enforced by `WriteBatch::delete_value`, which rejects oversized values.
                debug_assert!(value.len() <= MAX_INLINE_VALUE_SIZE);
                let mut data = [0u8; MAX_INLINE_VALUE_SIZE];
                data[..value.len()].copy_from_slice(value);
                ValueRef::KeyValueDeleted {
                    data,
                    len: value.len() as u8,
                }
            }
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
            let value_type = entry.value_ref.entry_type();

            if self.current_key_block.should_flush(key_len, key_hash) {
                let block_end = last_flushed_end + self.current_key_block.entry_count;
                let info = self.current_key_block.flush_info();
                self.flush_key_block(last_flushed_end, block_end, info)?;
                flushed_key_size = cumulative_key_size;
                last_flushed_end = block_end;
                self.current_key_block.reset();
            }

            cumulative_key_size += key_len;
            self.current_key_block.add(key_len, key_hash, value_type);
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
    ///
    /// Potentially reorders the keys into key order if we are not storing hashes.
    fn flush_key_block(&mut self, start: usize, end: usize, info: KeyBlockFlushInfo) -> Result<()> {
        let entry_count = end - start;
        let layout = choose_layout(info.max_key_len);
        let try_compress = info.max_key_len >= MIN_KEY_SIZE_FOR_COMPRESSION;

        // Read the boundary hash before reordering, which would move a different entry to `start`.
        // The index block must keep routing by the block's lowest hash.
        let first_hash = self.pending_keys[start].entry.key_hash();
        // Split the borrow of `self` so the block builders can hold `&mut key_buffer` while the
        // loops read `pending_keys`.
        let Self {
            key_buffer,
            pending_keys,
            ..
        } = self;
        key_buffer.clear();
        let build_key_order = |start: usize, end: usize| -> Vec<&PendingEntry<E>> {
            let mut key_order: Vec<&PendingEntry<E>> = pending_keys.range(start..end).collect();

            // Stable sort is important to preserve relative order of tombstones
            match info.uniform_key_len() {
                Some(4) => key_order.sort_by_key(|&e| be_key_u32(e.entry.key_bytes())),
                Some(8) => key_order.sort_by_key(|&e| be_key_u64(e.entry.key_bytes())),
                _ => key_order.sort_by_key(|&e| e.entry.key_bytes()),
            }
            key_order
        };

        if let KeyBlockFormat::Fixed {
            key_len: key_size,
            val_size,
            value_type,
        } = info.format
        {
            let mut builder = FixedKeyBlockBuilder::new(
                key_buffer,
                entry_count as u32,
                layout,
                key_size,
                val_size,
                value_type,
            );
            if layout == KeyBlockLayout::KeyOnly {
                for pending in build_key_order(start, end) {
                    builder.put(&pending.entry, &pending.value_ref);
                }
            } else {
                for pending in pending_keys.range(start..end) {
                    builder.put_with_hash(&pending.entry, &pending.value_ref);
                }
            }
            builder.finish();
        } else {
            let mut builder = KeyBlockBuilder::new(key_buffer, entry_count as u32, layout);
            if layout == KeyBlockLayout::KeyOnly {
                for pending in build_key_order(start, end) {
                    builder.put(&pending.entry, &pending.value_ref);
                }
            } else {
                for pending in pending_keys.range(start..end) {
                    builder.put_with_hash(&pending.entry, &pending.value_ref);
                }
            }

            builder.finish();
        }

        let block_index = write_block_to_file(
            self.file.as_mut().unwrap(),
            &mut self.compress_buffer,
            &mut self.block_offsets,
            &self.key_buffer,
            try_compress,
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

        // Write index block (never compressed). Buffer into a Vec first so we can
        // compute the checksum, then write via the standard block helper.
        let index_entry_count: u16 = (self.key_block_boundaries.len() - 1)
            .try_into()
            .expect("Index entries count overflow");
        let index_block_size: usize =
            INDEX_BLOCK_HEADER_SIZE + index_entry_count as usize * INDEX_BLOCK_ENTRY_SIZE;
        let mut index_buf = Vec::with_capacity(index_block_size);
        {
            let first_block = self.key_block_boundaries[0].1;
            let mut index_block = IndexBlockBuilder::new(&mut index_buf, first_block);
            for &(hash, block) in &self.key_block_boundaries[1..] {
                index_block.put(hash, block);
            }
        }
        let index_checksum = checksum_block(&index_buf);
        write_raw_block_to_file(
            &mut file,
            &mut self.block_offsets,
            0,
            index_checksum,
            &index_buf,
        )
        .context("Failed to write index block")?;

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

        // Build AMQF from collected hashes using sorted Builder insertion.
        // Hashes are already sorted by key_hash (SST invariant), but fingerprints
        // (truncated hashes) may not be sorted, so we sort by `fingerprint & mask`.
        let actual_count = self.collected_fingerprints.len() as u64;
        let mut builder = qfilter::Builder::new(
            qfilter::Filter::new(actual_count.max(1), AMQF_FALSE_POSITIVE_RATE)
                .expect("Filter can't be constructed"),
        );

        let fp_size = builder.fingerprint_size();
        assert!(fp_size < 32, "fp_size {fp_size} exceeds u32");
        let fp_mask = (1u32 << fp_size) - 1;
        // Mask in-place to fingerprint size and sort.
        self.collected_fingerprints
            .sort_unstable_by_key(|&h| h & fp_mask);
        for &h in &self.collected_fingerprints {
            builder
                .insert_fingerprint(false, h as u64)
                .expect("AMQF insert failed");
        }
        let filter = builder.into_filter();

        // Serialize AMQF using postcard for zero-copy deserialization via FilterRef
        let amqf = postcard::to_allocvec(&filter).expect("AMQF serialization failed");

        // Compute file size from block offsets rather than calling stream_position()
        // (which requires a flush + seek).
        let last_block_end = self.block_offsets.last().copied().unwrap_or_default() as u64;
        let offset_table_size = block_count as u64 * size_of::<u32>() as u64;
        let file_size = last_block_end + offset_table_size;

        let meta = StaticSortedFileBuilderMeta {
            min_hash: self.min_hash,
            max_hash: self.max_hash,
            amqf: Cow::Owned(amqf),
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
            let value_type = entry.value_ref.entry_type();

            if acc.should_flush(key_len, key_hash) {
                self.flush_key_block(block_start, i, acc.flush_info())?;
                block_start = i;
                acc.reset();
            }

            acc.add(key_len, key_hash, value_type);
        }

        // Flush the final block
        if block_start < total {
            self.flush_key_block(block_start, total, acc.flush_info())?;
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
    fn new(buffer: &'l mut Vec<u8>, entry_count: u32, layout: KeyBlockLayout) -> Self {
        debug_assert!(entry_count < (1 << 24));

        const ESTIMATED_KEY_SIZE: usize = 16;
        buffer.reserve(entry_count as usize * ESTIMATED_KEY_SIZE);
        let block_type = layout.block_type(false);
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

    /// Writes the entry header (position + type) for the current entry.
    fn write_entry_header(&mut self, entry_type: EntryType) {
        let pos = self.buffer.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((entry_type.0 as u32) << 24);
        BE::write_u32(&mut self.buffer[header_offset..header_offset + 4], header);
    }

    /// Writes a single entry (header +  key + value data) to the block.
    fn put<E: Entry>(&mut self, entry: &E, value_ref: &ValueRef) {
        self.write_entry_header(value_ref.entry_type());
        entry.write_key_to(self.buffer);
        value_ref.write_value_to(self.buffer);
        self.current_entry += 1;
    }
    /// Writes a single entry (header + hash + key + value data) to the block.
    fn put_with_hash<E: Entry>(&mut self, entry: &E, value_ref: &ValueRef) {
        self.write_entry_header(value_ref.entry_type());
        self.buffer
            .extend_from_slice(&entry.key_hash().to_be_bytes());
        entry.write_key_to(self.buffer);
        value_ref.write_value_to(self.buffer);
        self.current_entry += 1;
    }
    /// Returns the key block buffer.
    fn finish(self) -> &'l mut Vec<u8> {
        self.buffer
    }
}

// ---------------------------------------------------------------------------
// FixedKeyBlockBuilder
// ---------------------------------------------------------------------------

/// The size of the fixed-size key block header (block type + entry count + key size + value type).
/// Mixed-type blocks append one more byte for the value size.
const FIXED_KEY_BLOCK_HEADER_SIZE: usize = 6;

/// Builder for a fixed-size key block where all entries share the same key size and value size.
///
/// No offset table is written — entry positions are computed arithmetically from the stride. When
/// entries share a value size but not a value type, the header records
/// [`FIXED_KEY_BLOCK_MIXED_VALUE_TYPE`] and each entry carries its own type byte before its value.
struct FixedKeyBlockBuilder<'l> {
    buffer: &'l mut Vec<u8>,
    /// Whether each entry writes its own type byte (set for mixed-type blocks).
    per_entry_type: bool,
}

impl<'l> FixedKeyBlockBuilder<'l> {
    fn new(
        buffer: &'l mut Vec<u8>,
        entry_count: u32,
        layout: KeyBlockLayout,
        key_size: u8,
        val_size: u8,
        value_type: Option<EntryType>,
    ) -> Self {
        let hash_len = layout.hash_len() as usize;
        let per_entry_type = value_type.is_none();
        let stride = hash_len + key_size as usize + val_size as usize + usize::from(per_entry_type);
        buffer.reserve(FIXED_KEY_BLOCK_HEADER_SIZE + entry_count as usize * stride);

        let block_type = layout.block_type(true);
        buffer.extend_from_slice(&[
            block_type,
            (entry_count >> 16) as u8,
            (entry_count >> 8) as u8,
            entry_count as u8,
            key_size,
            value_type.map_or(FIXED_KEY_BLOCK_MIXED_VALUE_TYPE, |ty| ty.0),
        ]);
        // Mixed-type blocks cannot derive the value size from the header's type byte, so it is
        // written explicitly.
        if per_entry_type {
            buffer.push(val_size);
        }

        Self {
            buffer,
            per_entry_type,
        }
    }

    /// Writes a single entry (key + optional type byte + value data) to the block.
    fn put<E: Entry>(&mut self, entry: &E, value_ref: &ValueRef) {
        entry.write_key_to(self.buffer);
        if self.per_entry_type {
            self.buffer.push(value_ref.entry_type().0);
        }
        value_ref.write_value_to(self.buffer);
    }

    /// Writes a single entry (hash + key + optional type byte + value data) to the block.
    fn put_with_hash<E: Entry>(&mut self, entry: &E, value_ref: &ValueRef) {
        self.buffer
            .extend_from_slice(&entry.key_hash().to_be_bytes());
        entry.write_key_to(self.buffer);
        if self.per_entry_type {
            self.buffer.push(value_ref.entry_type().0);
        }
        value_ref.write_value_to(self.buffer);
    }
    fn finish(self) -> &'l mut Vec<u8> {
        self.buffer
    }
}

/// Returns the value size for a given entry type (builder-side, infallible).
///
/// This mirrors `entry_val_size` in the reader but panics on invalid types since the builder
/// only produces valid types.
fn value_type_val_size(ty: EntryType) -> usize {
    match ty.0 {
        KEY_BLOCK_ENTRY_TYPE_SMALL => SMALL_VALUE_REF_SIZE,
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => MEDIUM_VALUE_REF_SIZE,
        KEY_BLOCK_ENTRY_TYPE_BLOB => BLOB_VALUE_REF_SIZE,
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED => KEY_DELETED_REF_SIZE,
        // Must precede the inline arm: both are open-ended and the tombstone range sits above it.
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN => {
            (ty - KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN) as usize
        }
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
            (ty - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as usize
        }
        _ => panic!("Invalid key block entry type: {:?}", ty),
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
pub(crate) const INDEX_BLOCK_ENTRY_SIZE: usize = size_of::<u64>() + size_of::<u16>();

/// Size of the index block header (u8 type + u16 first_block).
pub(crate) const INDEX_BLOCK_HEADER_SIZE: usize = size_of::<u8>() + size_of::<u16>();

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
    use super::*;
    use crate::{
        key::hash_key,
        lookup_entry::LookupValue,
        static_sorted_file::{
            BlockCache, SstLookupResult, StaticSortedFile, StaticSortedFileMetaData,
        },
    };

    fn make_cache() -> BlockCache {
        BlockCache::with(
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
        KeyDeleted,
        KeyValueDeleted(Vec<u8>),
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
            Self::new(key, TestValueKind::KeyDeleted)
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

        fn key_bytes(&self) -> &[u8] {
            &self.key
        }

        fn value(&self) -> EntryValue<'_> {
            match &self.value_kind {
                TestValueKind::Inline(v) => EntryValue::Inline { value: v },
                TestValueKind::Small(v) => EntryValue::Small { value: v },
                TestValueKind::Medium(v) => EntryValue::Medium { value: v },
                TestValueKind::MediumRaw(v) => EntryValue::MediumRaw {
                    // uncompressed_size = 0 means the block is stored as-is (no compression).
                    uncompressed_size: 0,
                    checksum: checksum_block(v),
                    block: v,
                },
                TestValueKind::Blob(id) => EntryValue::Large { blob: *id },
                TestValueKind::KeyDeleted => EntryValue::KeyDeleted,
                TestValueKind::KeyValueDeleted(v) => EntryValue::KeyValueDeleted { value: v },
            }
        }
    }

    /// Sort entries by (hash, key) (required by SST writer).
    fn sort_entries(entries: &mut [TestEntry]) {
        entries.sort_by(|a, b| a.hash.cmp(&b.hash).then_with(|| a.key.cmp(&b.key)));
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
        kc: &BlockCache,
        vc: &BlockCache,
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
            (TestValueKind::KeyDeleted, SstLookupResult::Found(values))
                if values.len() == 1 && matches!(values[0], LookupValue::KeyDeleted) => {}
            (TestValueKind::KeyValueDeleted(expected), SstLookupResult::Found(values))
                if values.len() == 1
                    && matches!(values[0], LookupValue::KeyValueDeleted { .. }) =>
            {
                let LookupValue::KeyValueDeleted { value } = &values[0] else {
                    unreachable!()
                };
                assert_eq!(
                    value.as_ref(),
                    expected.as_slice(),
                    "tombstone value mismatch for key {:?}",
                    std::str::from_utf8(&entry.key)
                );
            }
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
                        (LookupValue::KeyDeleted, LookupValue::KeyDeleted) => {}
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

    /// Reads the first key block of an SST, returning its raw (uncompressed) bytes.
    ///
    /// Block 0 is always a key block; the block offset table sits at the end of the file.
    fn read_first_block(dir: &Path, seq: u32, block_count: u16) -> Result<Vec<u8>> {
        let data = fs_err::read(dir.join(format!("{seq:08}.sst")))?;
        let offsets_start = data.len() - block_count as usize * size_of::<u32>();
        let end = BE::read_u32(&data[offsets_start..]) as usize;
        let raw = &data[..end];
        // Each block is prefixed by BLOCK_HEADER_SIZE bytes: 4B uncompressed size + 4B checksum.
        // An uncompressed size of 0 means the block is stored as-is.
        let uncompressed_size = BE::read_u32(raw) as usize;
        let body = &raw[BLOCK_HEADER_SIZE..];
        Ok(if uncompressed_size == 0 {
            body.to_vec()
        } else {
            let mut out = vec![0u8; uncompressed_size];
            lzzzz::lz4::decompress(body, &mut out)?;
            out
        })
    }

    /// A tombstone and a value of the same size keep the block in fixed layout.
    ///
    /// This is what makes tombstones cheap for uniform-key families like the task cache: without
    /// the mixed-type layout, one tombstone would demote its whole block to the variable format
    /// and add a 4-byte offset table entry for every entry in it.
    #[test]
    fn fixed_layout_survives_mixed_value_types_of_equal_size() -> Result<()> {
        let dir = tempfile::tempdir()?;

        // Uniform 8-byte keys, uniform 4-byte values, but two different entry types.
        let mut entries: Vec<TestEntry> = (0..64u64)
            .map(|i| {
                let key = format!("k-{i:06}");
                if i % 4 == 0 {
                    TestEntry::new(
                        key.as_bytes(),
                        TestValueKind::KeyValueDeleted(vec![0xAAu8; 4]),
                    )
                } else {
                    TestEntry::inline(key.as_bytes(), &[0xBBu8; 4])
                }
            })
            .collect();
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        let block = read_first_block(dir.path(), 1, meta.block_count)?;

        assert_eq!(
            KeyBlockLayout::from_block_type(block[0]).map(|(_, fixed)| fixed),
            Some(true),
            "mixed value types of equal size should stay in fixed layout, got block type {}",
            block[0]
        );
        assert_eq!(
            block[5], FIXED_KEY_BLOCK_MIXED_VALUE_TYPE,
            "block should be marked mixed-type"
        );
        assert_eq!(block[6], 4, "value size should be recorded in the header");

        // The layout is only useful if it still reads back correctly.
        let sst = open_sst(dir.path(), 1, &meta)?;
        let kc = make_cache();
        let vc = make_cache();
        for entry in &entries {
            assert_lookup(&sst, entry, &kc, &vc)?;
        }
        Ok(())
    }

    /// Differing value *sizes* cannot share a stride, so the block must fall back to variable
    /// layout rather than silently misreading entries.
    #[test]
    fn mixed_value_sizes_fall_back_to_variable_layout() -> Result<()> {
        let dir = tempfile::tempdir()?;

        let mut entries: Vec<TestEntry> = (0..64u64)
            .map(|i| {
                let key = format!("k-{i:06}");
                let len = if i % 4 == 0 { 2 } else { 4 };
                TestEntry::inline(key.as_bytes(), &vec![0xCCu8; len])
            })
            .collect();
        sort_entries(&mut entries);

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default())?;
        let block = read_first_block(dir.path(), 1, meta.block_count)?;
        assert_eq!(
            KeyBlockLayout::from_block_type(block[0]).map(|(_, fixed)| fixed),
            Some(false),
            "differing value sizes should use variable layout, got block type {}",
            block[0]
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

    /// Flip a single byte in an SST file at the given position.
    fn corrupt_sst_byte(dir: &Path, seq: u32, pos: u64) {
        use std::io::{Seek, SeekFrom, Write as _};

        let sst_path = dir.join(format!("{seq:08}.sst"));
        let file_bytes = std::fs::read(&sst_path).unwrap();
        let original = file_bytes[pos as usize];
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .open(&sst_path)
            .unwrap();
        file.seek(SeekFrom::Start(pos)).unwrap();
        file.write_all(&[original ^ 0xFF]).unwrap();
        file.sync_all().unwrap();
    }

    /// Assert that looking up the first entry in a corrupted SST returns a corruption error.
    fn assert_corruption_detected(
        dir: &Path,
        seq: u32,
        meta: &StaticSortedFileBuilderMeta<'_>,
        entries: &[TestEntry],
    ) {
        let sst = open_sst(dir, seq, meta).unwrap();
        let kc = make_cache();
        let vc = make_cache();
        match sst.lookup::<_, false>(entries[0].hash, &entries[0].key, &kc, &vc) {
            Err(err) => {
                let msg = format!("{err}");
                assert!(
                    msg.contains("corruption"),
                    "Expected corruption error, got: {msg}"
                );
            }
            Ok(_) => panic!("Expected checksum error, but lookup succeeded"),
        }
    }

    #[test]
    fn checksum_detects_corrupted_compressed_block() {
        let dir = tempfile::tempdir().unwrap();
        // Medium value is large enough to get its own value block, which will be compressed
        let value = vec![0xCD; 8192];
        let entries = vec![TestEntry::medium(b"mkey", &value)];

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default()).unwrap();

        // Corrupt the stored checksum of the first block (bytes 4..8).
        // This guarantees a mismatch regardless of whether LZ4 decompression succeeds.
        corrupt_sst_byte(dir.path(), 1, 4);
        assert_corruption_detected(dir.path(), 1, &meta, &entries);
    }

    #[test]
    fn checksum_detects_corrupted_uncompressed_block() {
        let dir = tempfile::tempdir().unwrap();
        // Single inline entry - the key block will be small and likely stored uncompressed
        let entries = vec![TestEntry::inline(b"key1", b"val1")];

        let meta = write_sst(dir.path(), 1, &entries, MetaEntryFlags::default()).unwrap();

        // Corrupt a byte in the first block's data (after the 8-byte header)
        corrupt_sst_byte(dir.path(), 1, BLOCK_HEADER_SIZE as u64 + 1);
        assert_corruption_detected(dir.path(), 1, &meta, &entries);
    }

    #[test]
    fn be_key_order_matches_byte_order() {
        let keys4: Vec<[u8; 4]> = vec![
            [0, 0, 0, 0],
            [0, 0, 0, 1],
            [0, 0, 1, 0],
            [0x7f, 0xff, 0xff, 0xff],
            [0x80, 0, 0, 0],
            [0xff, 0xfe, 0, 0],
            [0xff, 0xff, 0xff, 0xff],
        ];
        for a in &keys4 {
            for b in &keys4 {
                assert_eq!(
                    be_key_u32(a).cmp(&be_key_u32(b)),
                    a[..].cmp(&b[..]),
                    "u32 order disagrees with byte order for {a:?} vs {b:?}"
                );
            }
        }
        let keys8: Vec<[u8; 8]> = vec![
            [0; 8],
            [0, 0, 0, 0, 0, 0, 0, 1],
            [0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
            [0x80, 0, 0, 0, 0, 0, 0, 0],
            [0xff; 8],
        ];
        for a in &keys8 {
            for b in &keys8 {
                assert_eq!(
                    be_key_u64(a).cmp(&be_key_u64(b)),
                    a[..].cmp(&b[..]),
                    "u64 order disagrees with byte order for {a:?} vs {b:?}"
                );
            }
        }
    }

    /// `uniform_key_len` must only report a length when the block's keys really are all that long,
    /// since the specialized sorts are unsound otherwise.
    #[test]
    fn uniform_key_len_requires_equal_lengths() {
        let mut acc = KeyBlockAccumulator::new();
        assert_eq!(acc.flush_info().uniform_key_len(), None, "empty block");

        let ty = EntryType(KEY_BLOCK_ENTRY_TYPE_INLINE_MIN);
        acc.add(8, 1, ty);
        acc.add(8, 2, ty);
        assert_eq!(acc.flush_info().uniform_key_len(), Some(8));

        acc.add(4, 3, ty);
        assert_eq!(
            acc.flush_info().uniform_key_len(),
            None,
            "mixed lengths must not report a uniform length"
        );

        acc.reset();
        acc.add(4, 4, ty);
        assert_eq!(
            acc.flush_info().uniform_key_len(),
            Some(4),
            "reset clears min"
        );
    }
}
