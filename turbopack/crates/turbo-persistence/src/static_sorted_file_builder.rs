use std::{
    borrow::Cow,
    collections::VecDeque,
    fs::File,
    io::{BufWriter, Seek, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{BE, ByteOrder, WriteBytesExt};
use turbo_bincode::turbo_bincode_encode;

use crate::{
    compression::compress_into_buffer,
    constants::{MAX_INLINE_VALUE_SIZE, MIN_SMALL_VALUE_BLOCK_SIZE},
    meta_file::{AmqfBincodeWrapper, MetaEntryFlags},
    static_sorted_file::{
        BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY_NO_HASH, BLOCK_TYPE_KEY_WITH_HASH,
        KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_DELETED, KEY_BLOCK_ENTRY_TYPE_INLINE_MIN,
        KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_SMALL,
    },
    value_block_count_tracker::ValueBlockCountTracker,
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
/// The maximum number of entries that should go into a single small value block
const MAX_SMALL_VALUE_BLOCK_ENTRIES: usize = MIN_SMALL_VALUE_BLOCK_SIZE;
/// The aimed false positive rate for the AMQF
const AMQF_FALSE_POSITIVE_RATE: f64 = 0.01;

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
    writer.finish()
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

struct PendingKeyEntry {
    key_hash: u64,
    key: Box<[u8]>,
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
pub struct StreamingSstWriter {
    // File I/O
    file: BufWriter<File>,
    compress_buffer: Vec<u8>,
    block_offsets: Vec<u32>,

    /// Pending key entries waiting to be flushed as key blocks.
    ///
    /// Entries are appended at the back and flushed from the front. The front entries up to
    /// `first_pending_small_index` are fully resolved and eligible for key block flushing.
    ///
    /// **Note:** This queue is effectively unbounded. In a pathological case -- a small number of
    /// small values followed by a large number of medium/inline values -- the queue can grow large
    /// because the front entries reference an unflushed small value block while the back keeps
    /// accepting resolved entries.
    pending_keys: VecDeque<PendingKeyEntry>,

    /// Index into `pending_keys` of the first entry that has a `PendingSmall` reference for the
    /// current (unflushed) small value block. All entries before this index are fully resolved
    /// (their value block indices are known). Equals `pending_keys.len()` when no pending small
    /// entries exist.
    first_pending_small_index: usize,

    /// The current small_block_id being accumulated into.
    current_small_block_id: u16,

    // Pending small value block buffer
    pending_small_values: Vec<u8>,
    pending_small_value_count: usize,

    // Reusable buffer for building key blocks
    key_buffer: Vec<u8>,

    // AMQF filter (built incrementally)
    filter: qfilter::Filter,

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
    value_block_count_tracker: ValueBlockCountTracker,
}

impl StreamingSstWriter {
    /// Creates a new streaming SST writer.
    ///
    /// `entry_count_hint` is used to size the AMQF filter. It may be an upper bound; a slightly
    /// oversized filter only improves the false-positive rate.
    pub fn new(file: &Path, flags: MetaEntryFlags, entry_count_hint: u64) -> Result<Self> {
        let file = BufWriter::new(File::create(file)?);
        let filter = qfilter::Filter::new(entry_count_hint.max(1), AMQF_FALSE_POSITIVE_RATE)
            .expect("Filter can't be constructed");

        Ok(Self {
            file,
            compress_buffer: Vec::new(),
            block_offsets: Vec::new(),
            pending_keys: VecDeque::new(),
            first_pending_small_index: 0,
            current_small_block_id: 0,
            pending_small_values: Vec::new(),
            pending_small_value_count: 0,
            key_buffer: Vec::new(),
            filter,
            key_block_boundaries: Vec::new(),
            min_hash: u64::MAX,
            max_hash: 0,
            entry_count: 0,
            flags,
            total_key_size: 0,
            total_value_size: 0,
            value_block_count_tracker: ValueBlockCountTracker::default(),
        })
    }

    /// Returns true if the SST file has reached capacity limits.
    ///
    /// This is intended for compaction callers that need to split output across multiple SST files.
    pub fn is_full(&self, max_entries: usize, max_data_size: usize) -> bool {
        self.entry_count as usize >= max_entries
            || self.total_key_size + self.total_value_size > max_data_size
            || self.value_block_count_tracker.is_full()
    }

    /// Adds an entry to the SST file. Entries must be added in key-hash order.
    pub fn add<E: Entry>(&mut self, entry: &E) -> Result<()> {
        let key_hash = entry.key_hash();

        // Update metadata
        if self.entry_count == 0 {
            self.min_hash = key_hash;
        }
        self.max_hash = key_hash;
        self.entry_count += 1;

        // Insert into AMQF
        self.filter
            .insert_fingerprint(false, key_hash)
            .expect("AMQF insert failed");

        // Copy key bytes
        // TODO: Explore deferring key copies until key block writing time.
        // This would require changing the Entry API to support borrowing keys or
        // storing entry references instead of copying key bytes eagerly.
        let mut key_buf = Vec::with_capacity(entry.key_len());
        entry.write_key_to(&mut key_buf);
        let key_len = key_buf.len();
        let key: Box<[u8]> = key_buf.into_boxed_slice();

        // Track key size for fullness
        self.total_key_size += key_len;

        // Route value
        let value_ref = match entry.value() {
            EntryValue::Medium { value } => {
                self.total_value_size += value.len();
                self.value_block_count_tracker.track(true, 0);
                let block_index = write_block_to_file(
                    &mut self.file,
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
                self.total_value_size += block.len();
                self.value_block_count_tracker.track(true, 0);
                let block_index = write_raw_block_to_file(
                    &mut self.file,
                    &mut self.block_offsets,
                    uncompressed_size,
                    block,
                )
                .context("Failed to write compressed value block")?;
                ValueRef::Medium { block_index }
            }
            EntryValue::Small { value } => {
                self.total_value_size += value.len();
                self.value_block_count_tracker.track(false, value.len());

                // Flush small value block if full BEFORE adding this value,
                // so entries referencing the previous block get resolved.
                if self.pending_small_values.len() >= MIN_SMALL_VALUE_BLOCK_SIZE
                    || self.pending_small_value_count >= MAX_SMALL_VALUE_BLOCK_ENTRIES
                {
                    self.flush_small_value_block()?;
                }

                let offset = self.pending_small_values.len() as u32;
                let size: u16 = value.len().try_into().unwrap();
                self.pending_small_values.extend_from_slice(value);
                self.pending_small_value_count += 1;

                // Track where the first PendingSmall entry is in the queue
                if self.first_pending_small_index >= self.pending_keys.len() {
                    self.first_pending_small_index = self.pending_keys.len();
                }

                let small_block_id = self.current_small_block_id;
                ValueRef::PendingSmall {
                    small_block_id,
                    offset,
                    size,
                }
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

        // Push pending key entry
        self.pending_keys.push_back(PendingKeyEntry {
            key_hash,
            key,
            value_ref,
        });

        // Try to flush completed key blocks
        self.try_flush_key_blocks()?;

        Ok(())
    }

    /// Flushes the current pending small value block to disk and resolves all `PendingSmall`
    /// entries in-place.
    fn flush_small_value_block(&mut self) -> Result<()> {
        // Early return if empty -- this simplifies trailing small value block handling in
        // `finish()` where we call this unconditionally.
        if self.pending_small_values.is_empty() {
            return Ok(());
        }

        let block_index = write_block_to_file(
            &mut self.file,
            &mut self.compress_buffer,
            &mut self.block_offsets,
            &self.pending_small_values,
            true,
        )
        .context("Failed to write small value block")?;

        // Resolve all PendingSmall entries for this block in-place.
        // Only scan from first_pending_small_index -- entries before it are guaranteed
        // already resolved (from previous flush calls).
        let flushed_id = self.current_small_block_id;
        for i in self.first_pending_small_index..self.pending_keys.len() {
            let entry = &mut self.pending_keys[i];
            if let ValueRef::PendingSmall {
                small_block_id,
                offset,
                size,
            } = entry.value_ref
            {
                debug_assert_eq!(small_block_id, flushed_id);
                entry.value_ref = ValueRef::Small {
                    block_index,
                    offset,
                    size,
                };
            }
        }

        // All PendingSmall entries are now resolved. No entries reference an unflushed block
        // until the next Small value arrives.
        self.first_pending_small_index = self.pending_keys.len();

        // Advance to next small block id
        self.current_small_block_id += 1;
        self.pending_small_values.clear();
        self.pending_small_value_count = 0;

        Ok(())
    }

    /// Tries to flush complete key blocks from the front of `pending_keys`.
    ///
    /// The resolved prefix boundary is known directly from `first_pending_small_index` -- all
    /// entries before that index have resolved value references. Within that prefix, we find
    /// key block boundaries and flush complete blocks in a single pass.
    fn try_flush_key_blocks(&mut self) -> Result<()> {
        let resolved_end = self.first_pending_small_index;

        if resolved_end == 0 {
            return Ok(());
        }

        // Single pass: find block boundaries and flush complete blocks.
        let mut block_start = 0;
        let mut block_size = 0usize;
        let mut block_entry_count = 0usize;
        let mut block_max_key_len = 0usize;
        let mut last_flushed_end = 0usize;
        let mut last_hash = 0u64;

        for i in 0..resolved_end {
            let entry = &self.pending_keys[i];
            let key_len = entry.key.len();
            let key_hash = entry.key_hash;

            if block_entry_count > 0
                && (block_size + key_len + KEY_BLOCK_ENTRY_META_OVERHEAD > MAX_KEY_BLOCK_SIZE
                    || block_entry_count >= MAX_KEY_BLOCK_ENTRIES)
                && last_hash != key_hash
            {
                self.flush_key_block(block_start, i, block_max_key_len)?;
                last_flushed_end = i;
                block_start = i;
                block_size = 0;
                block_max_key_len = 0;
                block_entry_count = 0;
            }

            block_size += key_len + KEY_BLOCK_ENTRY_META_OVERHEAD;
            block_max_key_len = block_max_key_len.max(key_len);
            block_entry_count += 1;
            last_hash = key_hash;
        }

        // Don't flush the trailing incomplete block -- it may grow more.

        if last_flushed_end > 0 {
            self.pending_keys.drain(..last_flushed_end);
            self.first_pending_small_index -= last_flushed_end;
        }

        Ok(())
    }

    /// Flushes a single key block from `pending_keys[start..end]`.
    fn flush_key_block(&mut self, start: usize, end: usize, max_key_len: usize) -> Result<()> {
        let entry_count = end - start;
        let has_hash = use_hash(max_key_len);

        self.key_buffer.clear();
        let mut builder = KeyBlockBuilder::new(&mut self.key_buffer, entry_count as u32, has_hash);

        for i in start..end {
            let entry = &self.pending_keys[i];
            match entry.value_ref {
                ValueRef::Small {
                    block_index,
                    offset,
                    size,
                } => {
                    builder.put_small(
                        entry.key_hash,
                        &entry.key,
                        block_index,
                        offset,
                        size,
                        has_hash,
                    );
                }
                ValueRef::Medium { block_index } => {
                    builder.put_medium(entry.key_hash, &entry.key, block_index, has_hash);
                }
                ValueRef::Inline { data, len } => {
                    builder.put_inline(entry.key_hash, &entry.key, &data[..len as usize], has_hash);
                }
                ValueRef::Blob { blob_id } => {
                    builder.put_blob(entry.key_hash, &entry.key, blob_id, has_hash);
                }
                ValueRef::Deleted => {
                    builder.delete(entry.key_hash, &entry.key, has_hash);
                }
                ValueRef::PendingSmall { .. } => {
                    unreachable!("PendingSmall should have been resolved");
                }
            }
        }

        // Drop builder to release borrow on key_buffer before writing
        builder.finish();

        // Record boundary
        let first_hash = self.pending_keys[start].key_hash;
        let block_index = write_block_to_file(
            &mut self.file,
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
    pub fn finish(mut self) -> Result<(StaticSortedFileBuilderMeta<'static>, File)> {
        // Flush remaining small value block (even if under MIN_SMALL_VALUE_BLOCK_SIZE).
        self.flush_small_value_block()?;

        // Now all PendingSmall entries are resolved. Flush all remaining key blocks.
        self.flush_remaining_key_blocks()?;

        // Handle empty file edge case
        if self.key_block_boundaries.is_empty() {
            // No entries were added. Write a minimal index block.
            self.key_buffer.clear();
            let index_block = IndexBlockBuilder::new(&mut self.key_buffer, 0, 0);
            index_block.finish();
            write_block_to_file(
                &mut self.file,
                &mut self.compress_buffer,
                &mut self.block_offsets,
                &self.key_buffer,
                false,
            )
            .context("Failed to write index block")?;
        } else {
            // Write index block
            self.key_buffer.clear();
            let entry_count: u16 = (self.key_block_boundaries.len() - 1)
                .try_into()
                .expect("Index entries count overflow");
            let first_block = self.key_block_boundaries[0].1;
            let mut index_block =
                IndexBlockBuilder::new(&mut self.key_buffer, entry_count, first_block);
            for &(hash, block) in &self.key_block_boundaries[1..] {
                index_block.put(hash, block);
            }
            index_block.finish();
            write_block_to_file(
                &mut self.file,
                &mut self.compress_buffer,
                &mut self.block_offsets,
                &self.key_buffer,
                false,
            )
            .context("Failed to write index block")?;
        }

        // Write block offset table
        for offset in &self.block_offsets {
            self.file
                .write_u32::<BE>(*offset)
                .context("Failed to write block offset")?;
        }

        let block_count: u16 = self
            .block_offsets
            .len()
            .try_into()
            .expect("Block count overflow");

        // Serialize AMQF
        let amqf = turbo_bincode_encode(&AmqfBincodeWrapper(self.filter))
            .expect("AMQF serialization failed");

        let meta = StaticSortedFileBuilderMeta {
            min_hash: self.min_hash,
            max_hash: self.max_hash,
            amqf: Cow::Owned(amqf.into_vec()),
            block_count,
            size: self.file.stream_position()?,
            flags: self.flags,
            entries: self.entry_count,
        };

        Ok((meta, self.file.into_inner()?))
    }

    /// Flushes all remaining entries as key blocks. Called from `finish()` after all small value
    /// blocks have been flushed, so all PendingSmall entries are resolved.
    fn flush_remaining_key_blocks(&mut self) -> Result<()> {
        if self.pending_keys.is_empty() {
            return Ok(());
        }

        let total = self.pending_keys.len();
        let mut block_start = 0;
        let mut block_size = 0;
        let mut block_max_key_len = 0;
        let mut last_hash = 0u64;

        for i in 0..total {
            let entry = &self.pending_keys[i];
            let key_len = entry.key.len();
            let key_hash = entry.key_hash;

            if block_size > 0
                && (block_size + key_len + KEY_BLOCK_ENTRY_META_OVERHEAD > MAX_KEY_BLOCK_SIZE
                    || i - block_start >= MAX_KEY_BLOCK_ENTRIES)
                && last_hash != key_hash
            {
                self.flush_key_block(block_start, i, block_max_key_len)?;
                block_start = i;
                block_size = 0;
                block_max_key_len = 0;
            }

            block_size += key_len + KEY_BLOCK_ENTRY_META_OVERHEAD;
            block_max_key_len = block_max_key_len.max(key_len);
            last_hash = key_hash;
        }

        // Flush the final block
        if block_start < total {
            self.flush_key_block(block_start, total, block_max_key_len)?;
        }

        self.pending_keys.clear();
        Ok(())
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

    /// Writes a small-sized value entry.
    fn put_small(
        &mut self,
        hash: u64,
        key: &[u8],
        value_block: u16,
        value_offset: u32,
        value_size: u16,
        has_hash: bool,
    ) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_SMALL);
        self.write_hash(hash, has_hash);
        self.buffer.extend_from_slice(key);
        self.buffer.write_u16::<BE>(value_block).unwrap();
        self.buffer.write_u16::<BE>(value_size).unwrap();
        self.buffer.write_u32::<BE>(value_offset).unwrap();
        self.current_entry += 1;
    }

    /// Writes a medium-sized value entry.
    fn put_medium(&mut self, hash: u64, key: &[u8], value_block: u16, has_hash: bool) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_MEDIUM);
        self.write_hash(hash, has_hash);
        self.buffer.extend_from_slice(key);
        self.buffer.write_u16::<BE>(value_block).unwrap();
        self.current_entry += 1;
    }

    /// Writes a tombstone entry.
    fn delete(&mut self, hash: u64, key: &[u8], has_hash: bool) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_DELETED);
        self.write_hash(hash, has_hash);
        self.buffer.extend_from_slice(key);
        self.current_entry += 1;
    }

    /// Writes a blob value entry.
    fn put_blob(&mut self, hash: u64, key: &[u8], blob_id: u32, has_hash: bool) {
        self.write_entry_header(KEY_BLOCK_ENTRY_TYPE_BLOB);
        self.write_hash(hash, has_hash);
        self.buffer.extend_from_slice(key);
        self.buffer.write_u32::<BE>(blob_id).unwrap();
        self.current_entry += 1;
    }

    /// Writes an inline value entry.
    fn put_inline(&mut self, hash: u64, key: &[u8], value: &[u8], has_hash: bool) {
        debug_assert!(value.len() <= MAX_INLINE_VALUE_SIZE);
        let entry_type = KEY_BLOCK_ENTRY_TYPE_INLINE_MIN + value.len() as u8;
        self.write_entry_header(entry_type);
        self.write_hash(hash, has_hash);
        self.buffer.extend_from_slice(key);
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
pub struct IndexBlockBuilder<'l> {
    buffer: &'l mut Vec<u8>,
}

impl<'l> IndexBlockBuilder<'l> {
    /// Creates a new builder for an index block with the specified number of entries and a pointer
    /// to the first block.
    pub fn new(buffer: &'l mut Vec<u8>, entry_count: u16, first_block: u16) -> Self {
        buffer.reserve(
            entry_count as usize * (size_of::<u64>() + size_of::<u16>())
                + size_of::<u8>()
                + size_of::<u16>(),
        );
        buffer.write_u8(BLOCK_TYPE_INDEX).unwrap();
        buffer.write_u16::<BE>(first_block).unwrap();
        Self { buffer }
    }

    /// Adds a hash boundary to the index block.
    pub fn put(&mut self, hash: u64, block: u16) {
        self.buffer.write_u64::<BE>(hash).unwrap();
        self.buffer.write_u16::<BE>(block).unwrap();
    }

    /// Returns the index block buffer
    fn finish(self) -> &'l mut Vec<u8> {
        self.buffer
    }
}
