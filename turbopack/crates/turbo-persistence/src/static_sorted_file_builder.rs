use std::{
    borrow::Cow,
    cmp::min,
    fs::File,
    io::{BufWriter, Seek, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{BE, ByteOrder, WriteBytesExt};

use crate::{
    compression::compress_into_buffer,
    static_sorted_file::{
        BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY, KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_DELETED,
        KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_SMALL,
    },
};

/// The maximum number of entries that should go into a single key block
const MAX_KEY_BLOCK_ENTRIES: usize = MAX_KEY_BLOCK_SIZE / KEY_BLOCK_ENTRY_META_OVERHEAD;
/// The maximum bytes that should go into a single key block
// Note this must fit into 3 bytes length
const MAX_KEY_BLOCK_SIZE: usize = 16 * 1024;
/// Overhead of bytes that should be counted for entries in a key block in addition to the key size
const KEY_BLOCK_ENTRY_META_OVERHEAD: usize = 8;
/// The maximum number of entries that should go into a single small value block
const MAX_SMALL_VALUE_BLOCK_ENTRIES: usize = MAX_SMALL_VALUE_BLOCK_SIZE;
/// The maximum bytes that should go into a single small value block
const MAX_SMALL_VALUE_BLOCK_SIZE: usize = 64 * 1024;
/// The aimed false positive rate for the AMQF
const AMQF_FALSE_POSITIVE_RATE: f64 = 0.01;

/// The maximum compression dictionary size for key and index blocks
const KEY_COMPRESSION_DICTIONARY_SIZE: usize = 64 * 1024 - 1;
/// The maximum bytes that should be selected as key samples to create a compression dictionary
const KEY_COMPRESSION_SAMPLES_SIZE: usize = 256 * 1024;
/// The minimum bytes that should be selected as keys samples. Below that no compression dictionary
/// is used.
const MIN_KEY_COMPRESSION_SAMPLES_SIZE: usize = 1024;
/// The bytes that are used per key entry for a sample.
const COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY: usize = 100;
/// The minimum bytes that are used per key entry for a sample.
const MIN_COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY: usize = 16;

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
    /// Small-sized value. They are stored in shared value blocks.
    Small { value: &'l [u8] },
    /// Medium-sized value. They are stored in their own value block.
    Medium { value: &'l [u8] },
    /// Medium-sized value. They are stored in their own value block. Precompressed.
    MediumCompressed {
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
    /// The key compression dictionary
    pub key_compression_dictionary_length: u16,
    /// The number of blocks in the SST file
    pub block_count: u16,
    /// The file size of the SST file
    pub size: u64,
    /// The number of entries in the SST file
    pub entries: u64,
}

pub fn write_static_stored_file<E: Entry>(
    entries: &[E],
    total_key_size: usize,
    file: &Path,
) -> Result<(StaticSortedFileBuilderMeta<'static>, File)> {
    debug_assert!(entries.iter().map(|e| e.key_hash()).is_sorted());

    let mut file = BufWriter::new(File::create(file)?);

    let capacity = get_compression_buffer_capacity(total_key_size);
    // We use a shared buffer for all operations to avoid excessive allocations
    let mut buffer = Vec::with_capacity(capacity);

    let key_dict = compute_key_compression_dictionary(entries, total_key_size, &mut buffer)?;
    file.write_all(&key_dict)?;

    let mut block_writer = BlockWriter::new(&mut file, &mut buffer);

    // Another shared buffer for the uncompressed blocks
    // The existing shared buffer will be used for compressed blocks
    // So we need both
    let mut buffer = Vec::new();

    let min_hash = entries.first().map_or(u64::MAX, |e| e.key_hash());
    let value_locations = write_value_blocks(entries, &mut block_writer, &mut buffer)
        .context("Failed to write value blocks")?;
    let amqf = write_key_blocks_and_compute_amqf(
        entries,
        &value_locations,
        &key_dict,
        &mut block_writer,
        &mut buffer,
    )
    .context("Failed to write key blocks")?;
    let max_hash = entries.last().map_or(0, |e| e.key_hash());

    let block_count = block_writer.block_count();
    for offset in &block_writer.block_offsets {
        file.write_u32::<BE>(*offset)
            .context("Failed to write block offset")?;
    }

    let meta = StaticSortedFileBuilderMeta {
        min_hash,
        max_hash,
        amqf: Cow::Owned(amqf),
        key_compression_dictionary_length: key_dict.len().try_into().unwrap(),
        block_count,
        size: file.stream_position()?,
        entries: entries.len() as u64,
    };
    Ok((meta, file.into_inner()?))
}

fn get_compression_buffer_capacity(total_key_size: usize) -> usize {
    let mut size = 0;
    if total_key_size >= MIN_KEY_COMPRESSION_SAMPLES_SIZE {
        let key_compression_samples_size = min(KEY_COMPRESSION_SAMPLES_SIZE, total_key_size / 16);
        size = key_compression_samples_size;
    }
    size
}

/// Computes compression dictionaries from keys of all entries
#[tracing::instrument(level = "trace", skip(entries))]
fn compute_key_compression_dictionary<E: Entry>(
    entries: &[E],
    total_key_size: usize,
    buffer: &mut Vec<u8>,
) -> Result<Vec<u8>> {
    if total_key_size < MIN_KEY_COMPRESSION_SAMPLES_SIZE {
        return Ok(Vec::new());
    }
    let key_compression_samples_size = min(KEY_COMPRESSION_SAMPLES_SIZE, total_key_size / 16);
    let mut sample_sizes = Vec::new();

    // Limit the number of iterations to avoid infinite loops
    let max_iterations = total_key_size / COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY * 2;
    for i in 0..max_iterations {
        let entry = &entries[i % entries.len()];
        let key_remaining = key_compression_samples_size - buffer.len();
        if key_remaining < MIN_COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY {
            break;
        }
        let len = entry.key_len();
        if len >= MIN_COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY {
            let used_len = min(key_remaining, COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY);
            if len <= used_len {
                sample_sizes.push(len);
                entry.write_key_to(buffer);
            } else {
                let mut temp = Vec::with_capacity(len);
                entry.write_key_to(&mut temp);
                debug_assert!(temp.len() == len);

                let p = buffer.len() % (len - used_len);
                sample_sizes.push(used_len);
                buffer.extend_from_slice(&temp[p..p + used_len]);
            }
        }
    }
    debug_assert!(buffer.len() == sample_sizes.iter().sum::<usize>());
    let result = if buffer.len() > MIN_KEY_COMPRESSION_SAMPLES_SIZE && sample_sizes.len() > 5 {
        zstd::dict::from_continuous(buffer, &sample_sizes, KEY_COMPRESSION_DICTIONARY_SIZE)
            .context("Key dictionary creation failed")?
    } else {
        Vec::new()
    };
    buffer.clear();
    Ok(result)
}

struct BlockWriter<'l> {
    buffer: &'l mut Vec<u8>,
    block_offsets: Vec<u32>,
    writer: &'l mut BufWriter<File>,
}

impl<'l> BlockWriter<'l> {
    fn new(writer: &'l mut BufWriter<File>, buffer: &'l mut Vec<u8>) -> Self {
        Self {
            buffer,
            block_offsets: Vec::new(),
            writer,
        }
    }

    fn next_block_index(&mut self) -> u16 {
        self.block_offsets
            .len()
            .try_into()
            .expect("Block index overflow")
    }

    fn block_count(&self) -> u16 {
        self.block_offsets
            .len()
            .try_into()
            .expect("Block count overflow")
    }

    #[tracing::instrument(level = "trace", skip_all)]
    fn write_key_block(&mut self, block: &[u8], dict: &[u8]) -> Result<()> {
        self.write_block(block, Some(dict), false)
            .context("Failed to write key block")
    }

    #[tracing::instrument(level = "trace", skip_all)]
    fn write_index_block(&mut self, block: &[u8], dict: &[u8]) -> Result<()> {
        self.write_block(block, Some(dict), false)
            .context("Failed to write index block")
    }

    #[tracing::instrument(level = "trace", skip_all)]
    fn write_small_value_block(&mut self, block: &[u8]) -> Result<()> {
        self.write_block(block, None, false)
            .context("Failed to write small value block")
    }

    #[tracing::instrument(level = "trace", skip_all)]
    fn write_value_block(&mut self, block: &[u8]) -> Result<()> {
        self.write_block(block, None, true)
            .context("Failed to write value block")
    }

    fn write_block(&mut self, block: &[u8], dict: Option<&[u8]>, long_term: bool) -> Result<()> {
        let uncompressed_size = block.len().try_into().unwrap();
        self.compress_block_into_buffer(block, dict, long_term)?;
        let len = (self.buffer.len() + 4).try_into().unwrap();
        let offset = self
            .block_offsets
            .last()
            .copied()
            .unwrap_or_default()
            .checked_add(len)
            .expect("Block offset overflow");
        self.block_offsets.push(offset);

        self.writer
            .write_u32::<BE>(uncompressed_size)
            .context("Failed to write uncompressed size")?;
        self.writer
            .write_all(self.buffer)
            .context("Failed to write compressed block")?;
        self.buffer.clear();
        Ok(())
    }

    fn write_compressed_block(&mut self, uncompressed_size: u32, block: &[u8]) -> Result<()> {
        let len = (block.len() + 4).try_into().unwrap();
        let offset = self
            .block_offsets
            .last()
            .copied()
            .unwrap_or_default()
            .checked_add(len)
            .expect("Block offset overflow");
        self.block_offsets.push(offset);

        self.writer
            .write_u32::<BE>(uncompressed_size)
            .context("Failed to write uncompressed size")?;
        self.writer
            .write_all(block)
            .context("Failed to write compressed block")?;
        Ok(())
    }

    /// Compresses a block with a compression dictionary.
    fn compress_block_into_buffer(
        &mut self,
        block: &[u8],
        dict: Option<&[u8]>,
        long_term: bool,
    ) -> Result<()> {
        compress_into_buffer(block, dict, long_term, self.buffer)
    }
}

/// Splits the values of the entries into blocks and writes them to the writer.
#[tracing::instrument(level = "trace", skip_all)]
fn write_value_blocks(
    entries: &[impl Entry],
    writer: &mut BlockWriter<'_>,
    buffer: &mut Vec<u8>,
) -> Result<Vec<(u16, u32)>> {
    let mut value_locations: Vec<(u16, u32)> = Vec::with_capacity(entries.len());

    let mut current_block_start = 0;
    let mut current_block_count = 0;
    let mut current_block_size = 0;
    for (i, entry) in entries.iter().enumerate() {
        match entry.value() {
            EntryValue::Small { value } => {
                if current_block_size + value.len() > MAX_SMALL_VALUE_BLOCK_SIZE
                    || current_block_count + 1 >= MAX_SMALL_VALUE_BLOCK_ENTRIES
                {
                    let block_index = writer.next_block_index();
                    buffer.reserve(current_block_size);
                    for j in current_block_start..i {
                        if let EntryValue::Small { value } = &entries[j].value() {
                            buffer.extend_from_slice(value);
                            value_locations[j].0 = block_index;
                        }
                    }
                    writer.write_small_value_block(buffer)?;
                    buffer.clear();
                    current_block_start = i;
                    current_block_size = 0;
                    current_block_count = 0;
                }
                value_locations.push((0, current_block_size.try_into().unwrap()));
                current_block_size += value.len();
                current_block_count += 1;
            }
            EntryValue::Medium { value } => {
                let block_index = writer.next_block_index();
                value_locations.push((block_index, 0));
                writer.write_value_block(value)?;
            }
            EntryValue::MediumCompressed {
                uncompressed_size,
                block,
            } => {
                let block_index = writer.next_block_index();
                value_locations.push((block_index, 0));
                writer.write_compressed_block(uncompressed_size, block)?;
            }
            EntryValue::Deleted | EntryValue::Large { .. } => {
                value_locations.push((0, 0));
            }
        }
    }
    if current_block_count > 0 {
        let block_index = writer.next_block_index();
        buffer.reserve(current_block_size);
        for j in current_block_start..entries.len() {
            if let EntryValue::Small { value } = &entries[j].value() {
                buffer.extend_from_slice(value);
                value_locations[j].0 = block_index;
            }
        }
        writer.write_small_value_block(buffer)?;
        buffer.clear();
    }

    Ok(value_locations)
}

/// Splits the keys of the entries into blocks and writes them to the writer. Also writes an index
/// block.
#[tracing::instrument(level = "trace", skip_all)]
fn write_key_blocks_and_compute_amqf(
    entries: &[impl Entry],
    value_locations: &[(u16, u32)],
    key_compression_dictionary: &[u8],
    writer: &mut BlockWriter<'_>,
    buffer: &mut Vec<u8>,
) -> Result<Vec<u8>> {
    let mut filter = qfilter::Filter::new(entries.len() as u64, AMQF_FALSE_POSITIVE_RATE)
        // This won't fail as we limit the number of entries per SST file
        .expect("Filter can't be constructed");

    let mut key_block_boundaries = Vec::new();

    // Split the keys into blocks
    fn add_entry_to_block<E: Entry>(
        entry: &E,
        value_location: &(u16, u32),
        block: &mut KeyBlockBuilder,
    ) {
        match entry.value() {
            EntryValue::Small { value } => {
                block.put_small(
                    entry,
                    value_location.0,
                    value_location.1,
                    value.len().try_into().unwrap(),
                );
            }
            EntryValue::Medium { .. } | EntryValue::MediumCompressed { .. } => {
                block.put_medium(entry, value_location.0);
            }
            EntryValue::Large { blob } => {
                block.put_blob(entry, blob);
            }
            EntryValue::Deleted => {
                block.delete(entry);
            }
        }
    }
    let mut current_block_start = 0;
    let mut current_block_size = 0;
    let mut last_hash = 0;
    for (i, entry) in entries.iter().enumerate() {
        let key_hash = entry.key_hash();

        // Add to AMQF
        filter
            .insert_fingerprint(false, key_hash)
            // This can't fail as we allocated enough capacity
            .expect("AMQF insert failed");

        // Accumulate until the block is full
        if current_block_size > 0
                && (current_block_size + entry.key_len() + KEY_BLOCK_ENTRY_META_OVERHEAD
                    > MAX_KEY_BLOCK_SIZE
                    || i - current_block_start >= MAX_KEY_BLOCK_ENTRIES) &&
                    // avoid breaking the block in the middle of a hash conflict
                    last_hash != key_hash
        {
            let mut block = KeyBlockBuilder::new(buffer, (i - current_block_start) as u32);
            for j in current_block_start..i {
                let entry = &entries[j];
                let value_location = &value_locations[j];
                add_entry_to_block(entry, value_location, &mut block);
            }
            key_block_boundaries.push((
                entries[current_block_start].key_hash(),
                writer.next_block_index(),
            ));
            block.finish();
            writer.write_key_block(buffer, key_compression_dictionary)?;
            buffer.clear();
            current_block_size = 0;
            current_block_start = i;
        }
        current_block_size += entry.key_len() + KEY_BLOCK_ENTRY_META_OVERHEAD;
        last_hash = key_hash;
    }

    // Finish the last block
    if current_block_size > 0 {
        let mut block = KeyBlockBuilder::new(buffer, (entries.len() - current_block_start) as u32);
        for j in current_block_start..entries.len() {
            let entry = &entries[j];
            let value_location = &value_locations[j];
            add_entry_to_block(entry, value_location, &mut block);
        }
        key_block_boundaries.push((
            entries[current_block_start].key_hash(),
            writer.next_block_index(),
        ));
        block.finish();
        writer.write_key_block(buffer, key_compression_dictionary)?;
        buffer.clear();
    }

    // Compute the index
    let mut index_block = IndexBlockBuilder::new(
        buffer,
        key_block_boundaries
            .len()
            .try_into()
            .expect("Index entries count overflow"),
        key_block_boundaries[0].1,
    );
    for (hash, block) in &key_block_boundaries[1..] {
        index_block.put(*hash, *block);
    }
    let _ = writer.next_block_index();
    index_block.finish();
    writer.write_index_block(buffer, key_compression_dictionary)?;
    buffer.clear();

    Ok(pot::to_vec(&filter).expect("AMQF serialization failed"))
}

/// Builder for a single key block
pub struct KeyBlockBuilder<'l> {
    current_entry: usize,
    header_size: usize,
    buffer: &'l mut Vec<u8>,
}

/// The size of the key block header.
const KEY_BLOCK_HEADER_SIZE: usize = 4;

impl<'l> KeyBlockBuilder<'l> {
    /// Creates a new key block builder for the number of entries.
    pub fn new(buffer: &'l mut Vec<u8>, entry_count: u32) -> Self {
        debug_assert!(entry_count < (1 << 24));

        const ESTIMATED_KEY_SIZE: usize = 16;
        buffer.reserve(entry_count as usize * ESTIMATED_KEY_SIZE);
        buffer.write_u8(BLOCK_TYPE_KEY).unwrap();
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

    /// Writes a small-sized value to the buffer.
    pub fn put_small<E: Entry>(
        &mut self,
        entry: &E,
        value_block: u16,
        value_offset: u32,
        value_size: u16,
    ) {
        let pos = self.buffer.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_SMALL as u32) << 24);
        BE::write_u32(&mut self.buffer[header_offset..header_offset + 4], header);

        self.buffer.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(self.buffer);
        self.buffer.write_u16::<BE>(value_block).unwrap();
        self.buffer.write_u16::<BE>(value_size).unwrap();
        self.buffer.write_u32::<BE>(value_offset).unwrap();

        self.current_entry += 1;
    }

    /// Writes a medium-sized value to the buffer.
    pub fn put_medium<E: Entry>(&mut self, entry: &E, value_block: u16) {
        let pos = self.buffer.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_MEDIUM as u32) << 24);
        BE::write_u32(&mut self.buffer[header_offset..header_offset + 4], header);

        self.buffer.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(self.buffer);
        self.buffer.write_u16::<BE>(value_block).unwrap();

        self.current_entry += 1;
    }

    /// Writes a tombstone to the buffer.
    pub fn delete<E: Entry>(&mut self, entry: &E) {
        let pos = self.buffer.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_DELETED as u32) << 24);
        BE::write_u32(&mut self.buffer[header_offset..header_offset + 4], header);

        self.buffer.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(self.buffer);

        self.current_entry += 1;
    }

    /// Writes a blob value to the buffer.
    pub fn put_blob<E: Entry>(&mut self, entry: &E, blob: u32) {
        let pos = self.buffer.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_BLOB as u32) << 24);
        BE::write_u32(&mut self.buffer[header_offset..header_offset + 4], header);

        self.buffer.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(self.buffer);
        self.buffer.write_u32::<BE>(blob).unwrap();

        self.current_entry += 1;
    }

    /// Returns the key block buffer
    pub fn finish(self) -> &'l mut Vec<u8> {
        self.buffer
    }
}

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
