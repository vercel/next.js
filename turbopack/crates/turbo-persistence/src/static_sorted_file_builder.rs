use std::{
    cmp::min,
    fs::File,
    io::{self, BufWriter, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{ByteOrder, WriteBytesExt, BE};
use lzzzz::lz4::{max_compressed_size, ACC_LEVEL_DEFAULT};

use crate::static_sorted_file::{
    BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY, KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_DELETED,
    KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_SMALL,
};

/// The maximum number of entries that should go into a single key block
const MAX_KEY_BLOCK_ENTRIES: usize = 100 * 1024;
/// The maximum bytes that should go into a single key block
// Note this must fit into 3 bytes length
const MAX_KEY_BLOCK_SIZE: usize = 16 * 1024;
/// Overhead of bytes that should be counted for entries in a key block in addition to the key size
const KEY_BLOCK_ENTRY_META_OVERHEAD: usize = 8;
/// The maximum number of entries that should go into a single small value block
const MAX_SMALL_VALUE_BLOCK_ENTRIES: usize = 100 * 1024;
/// The maximum bytes that should go into a single small value block
const MAX_SMALL_VALUE_BLOCK_SIZE: usize = 16 * 1024;
/// The aimed false positive rate for the AQMF
const AQMF_FALSE_POSITIVE_RATE: f64 = 0.01;

/// The maximum compression dictionay size for value blocks
const VALUE_COMPRESSION_DICTIONARY_SIZE: usize = 64 * 1024 - 1;
/// The maximum compression dictionay size for key and index blocks
const KEY_COMPRESSION_DICTIONARY_SIZE: usize = 64 * 1024 - 1;
/// The maximum bytes that should be selected as value samples to create a compression dictionary
const VALUE_COMPRESSION_SAMPLES_SIZE: usize = 256 * 1024;
/// The maximum bytes that should be selected as key samples to create a compression dictionary
const KEY_COMPRESSION_SAMPLES_SIZE: usize = 256 * 1024;
/// The minimum bytes that should be selected as value samples. Below that no compression dictionary
/// is used.
const MIN_VALUE_COMPRESSION_SAMPLES_SIZE: usize = 1024;
/// The minimum bytes that should be selected as key samples. Below that no compression dictionary
/// is used.
const MIN_KEY_COMPRESSION_SAMPLES_SIZE: usize = 1024;
/// The bytes that are used per key/value entry for a sample.
const COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY: usize = 100;

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
    /// Large-sized value. They are stored in a blob file.
    Large { blob: u32 },
    /// Tombstone. The value was removed.
    Deleted,
}

#[derive(Debug, Default)]
pub struct StaticSortedFileBuilder {
    family: u32,
    aqmf: Vec<u8>,
    key_compression_dictionary: Vec<u8>,
    value_compression_dictionary: Vec<u8>,
    blocks: Vec<(u32, Vec<u8>)>,
    min_hash: u64,
    max_hash: u64,
}

impl StaticSortedFileBuilder {
    pub fn new<E: Entry>(
        family: u32,
        entries: &[E],
        total_key_size: usize,
        total_value_size: usize,
    ) -> Result<Self> {
        debug_assert!(entries.iter().map(|e| e.key_hash()).is_sorted());
        let mut builder = Self {
            family,
            min_hash: entries.first().map(|e| e.key_hash()).unwrap_or(u64::MAX),
            max_hash: entries.last().map(|e| e.key_hash()).unwrap_or(0),
            ..Default::default()
        };
        builder.compute_aqmf(entries);
        builder.compute_compression_dictionary(entries, total_key_size, total_value_size)?;
        builder.compute_blocks(entries);
        Ok(builder)
    }

    /// Computes a AQMF from the keys of all entries.
    fn compute_aqmf<E: Entry>(&mut self, entries: &[E]) {
        let mut filter = qfilter::Filter::new(entries.len() as u64, AQMF_FALSE_POSITIVE_RATE)
            // This won't fail as we limit the number of entries per SST file
            .expect("Filter can't be constructed");
        for entry in entries {
            filter
                .insert_fingerprint(false, entry.key_hash())
                // This can't fail as we allocated enough capacity
                .expect("AQMF insert failed");
        }
        self.aqmf = pot::to_vec(&filter).expect("AQMF serialization failed");
    }

    /// Computes compression dictionaries from keys and values of all entries
    fn compute_compression_dictionary<E: Entry>(
        &mut self,
        entries: &[E],
        total_key_size: usize,
        total_value_size: usize,
    ) -> Result<()> {
        if total_key_size < MIN_KEY_COMPRESSION_SAMPLES_SIZE
            && total_value_size < MIN_VALUE_COMPRESSION_SAMPLES_SIZE
        {
            return Ok(());
        }
        let key_compression_samples_size = min(KEY_COMPRESSION_SAMPLES_SIZE, total_key_size / 10);
        let value_compression_samples_size =
            min(VALUE_COMPRESSION_SAMPLES_SIZE, total_value_size / 10);
        let mut value_samples = Vec::with_capacity(value_compression_samples_size);
        let mut value_sample_sizes = Vec::new();
        let mut key_samples = Vec::with_capacity(key_compression_samples_size);
        let mut key_sample_sizes = Vec::new();
        let mut i = 12345678 % entries.len();
        let mut j = 0;
        loop {
            let entry = &entries[i];
            let value_remaining = value_compression_samples_size - value_samples.len();
            let key_remaining = key_compression_samples_size - key_samples.len();
            if value_remaining > 0 {
                if let EntryValue::Small { value } | EntryValue::Medium { value } = entry.value() {
                    let value = if value.len() <= COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY {
                        value
                    } else {
                        j = (j + 12345678)
                            % (value.len() - COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY);
                        &value[j..j + COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY]
                    };
                    if value.len() <= value_remaining {
                        value_sample_sizes.push(value.len());
                        value_samples.extend_from_slice(value);
                    } else {
                        value_sample_sizes.push(value_remaining);
                        value_samples.extend_from_slice(&value[..value_remaining]);
                    }
                }
            }
            if key_remaining > 0 {
                let used_len = min(key_remaining, COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY);
                if entry.key_len() <= used_len {
                    key_sample_sizes.push(entry.key_len());
                    entry.write_key_to(&mut key_samples);
                } else {
                    let mut temp = Vec::with_capacity(entry.key_len());
                    entry.write_key_to(&mut temp);
                    debug_assert!(temp.len() == entry.key_len());

                    j = (j + 12345678) % (temp.len() - used_len);
                    key_sample_sizes.push(used_len);
                    key_samples.extend_from_slice(&temp[j..j + used_len]);
                }
            }
            if key_remaining == 0 && value_remaining == 0 {
                break;
            }
            i = (i + 12345678) % entries.len();
        }
        assert!(key_samples.len() == key_sample_sizes.iter().sum::<usize>());
        assert!(value_samples.len() == value_sample_sizes.iter().sum::<usize>());
        if key_samples.len() > MIN_KEY_COMPRESSION_SAMPLES_SIZE && key_sample_sizes.len() > 5 {
            self.key_compression_dictionary = zstd::dict::from_continuous(
                &key_samples,
                &key_sample_sizes,
                KEY_COMPRESSION_DICTIONARY_SIZE,
            )
            .context("Key dictionary creation failed")?;
        }
        if value_samples.len() > MIN_VALUE_COMPRESSION_SAMPLES_SIZE && value_sample_sizes.len() > 5
        {
            self.value_compression_dictionary = zstd::dict::from_continuous(
                &value_samples,
                &value_sample_sizes,
                VALUE_COMPRESSION_DICTIONARY_SIZE,
            )
            .context("Value dictionary creation failed")?;
        }
        Ok(())
    }

    /// Compute index, key and value blocks.
    fn compute_blocks<E: Entry>(&mut self, entries: &[E]) {
        // TODO implement multi level index
        // TODO place key and value block near to each other

        // For now we use something simple to implement:
        // Start with Value blocks
        // And then Key blocks
        // Last block is Index block

        // Store the locations of the values
        let mut value_locations: Vec<(usize, usize)> = Vec::with_capacity(entries.len());

        // Split the values into blocks
        let mut current_block_start = 0;
        let mut current_block_count = 0;
        let mut current_block_size = 0;
        for (i, entry) in entries.iter().enumerate() {
            match entry.value() {
                EntryValue::Small { value } => {
                    if current_block_size + value.len() > MAX_SMALL_VALUE_BLOCK_SIZE
                        || current_block_count + 1 >= MAX_SMALL_VALUE_BLOCK_ENTRIES
                    {
                        let block_index = self.blocks.len();
                        let mut block = Vec::with_capacity(current_block_size);
                        for j in current_block_start..i {
                            if let EntryValue::Small { value } = &entries[j].value() {
                                block.extend_from_slice(value);
                                value_locations[j].0 = block_index;
                            }
                        }
                        self.blocks.push(self.compress_value_block(&block));
                        current_block_start = i;
                        current_block_size = 0;
                        current_block_count = 0;
                    }
                    value_locations.push((0, current_block_size));
                    current_block_size += value.len();
                    current_block_count += 1;
                }
                EntryValue::Medium { value } => {
                    value_locations.push((self.blocks.len(), value.len()));
                    self.blocks.push(self.compress_value_block(value));
                }
                _ => {
                    value_locations.push((0, 0));
                }
            }
        }
        if current_block_count > 0 {
            let block_index = self.blocks.len();
            let mut block = Vec::with_capacity(current_block_size);
            for j in current_block_start..entries.len() {
                if let EntryValue::Small { value } = &entries[j].value() {
                    block.extend_from_slice(value);
                    value_locations[j].0 = block_index;
                }
            }
            self.blocks.push(self.compress_value_block(&block));
        }

        let mut key_block_boundaries = Vec::new();

        // Split the keys into blocks
        fn add_entry_to_block<E: Entry>(
            entry: &E,
            value_location: &(usize, usize),
            block: &mut KeyBlockBuilder,
        ) {
            match entry.value() {
                EntryValue::Small { value } => {
                    block.put_small(
                        entry,
                        value_location.0.try_into().unwrap(),
                        value_location.1.try_into().unwrap(),
                        value.len().try_into().unwrap(),
                    );
                }
                EntryValue::Medium { .. } => {
                    block.put_medium(entry, value_location.0.try_into().unwrap());
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
        for (i, entry) in entries.iter().enumerate() {
            if current_block_size > 0
                && (current_block_size + entry.key_len() + KEY_BLOCK_ENTRY_META_OVERHEAD
                    > MAX_KEY_BLOCK_SIZE
                    || i - current_block_start >= MAX_KEY_BLOCK_ENTRIES) &&
                    // avoid breaking the block in the middle of a hash conflict
                    entries[i - 1].key_hash() != entry.key_hash()
            {
                let mut block = KeyBlockBuilder::new((i - current_block_start) as u32);
                for j in current_block_start..i {
                    let entry = &entries[j];
                    let value_location = &value_locations[j];
                    add_entry_to_block(entry, value_location, &mut block);
                }
                key_block_boundaries
                    .push((entries[current_block_start].key_hash(), self.blocks.len()));
                self.blocks.push(self.compress_key_block(&block.finish()));
                current_block_size = 0;
                current_block_start = i;
            }
            current_block_size += entry.key_len() + KEY_BLOCK_ENTRY_META_OVERHEAD;
        }
        if current_block_size > 0 {
            let mut block = KeyBlockBuilder::new((entries.len() - current_block_start) as u32);
            for j in current_block_start..entries.len() {
                let entry = &entries[j];
                let value_location = &value_locations[j];
                add_entry_to_block(entry, value_location, &mut block);
            }
            key_block_boundaries.push((entries[current_block_start].key_hash(), self.blocks.len()));
            self.blocks.push(self.compress_key_block(&block.finish()));
        }

        // Compute the index
        let mut index_block = IndexBlockBuilder::new(
            key_block_boundaries.len() as u16,
            key_block_boundaries[0].1 as u16,
        );
        for (hash, block) in &key_block_boundaries[1..] {
            index_block.put(*hash, *block as u16);
        }
        self.blocks
            .push(self.compress_key_block(&index_block.finish()));
    }

    /// Compresses a block with a compression dictionary.
    fn compress_block(&self, block: &[u8], dict: &[u8]) -> (u32, Vec<u8>) {
        let mut compressor =
            lzzzz::lz4::Compressor::with_dict(dict).expect("LZ4 compressor creation failed");
        let mut compressed = Vec::with_capacity(max_compressed_size(block.len()));
        compressor
            .next_to_vec(block, &mut compressed, ACC_LEVEL_DEFAULT)
            .expect("Compression failed");
        if compressed.capacity() > compressed.len() * 2 {
            compressed.shrink_to_fit();
        }
        (block.len().try_into().unwrap(), compressed)
    }

    /// Compresses an index or key block.
    fn compress_key_block(&self, block: &[u8]) -> (u32, Vec<u8>) {
        self.compress_block(block, &self.key_compression_dictionary)
    }

    /// Compresses a value block.
    fn compress_value_block(&self, block: &[u8]) -> (u32, Vec<u8>) {
        self.compress_block(block, &self.value_compression_dictionary)
    }

    /// Writes the SST file.
    pub fn write(&self, file: &Path) -> io::Result<File> {
        let mut file = BufWriter::new(File::create(file)?);
        // magic number and version
        file.write_u32::<BE>(0x53535401)?;
        // family
        file.write_u32::<BE>(self.family)?;
        // min hash
        file.write_u64::<BE>(self.min_hash)?;
        // max hash
        file.write_u64::<BE>(self.max_hash)?;
        // AQMF length
        file.write_u24::<BE>(self.aqmf.len().try_into().unwrap())?;
        // Key compression dictionary length
        file.write_u16::<BE>(self.key_compression_dictionary.len().try_into().unwrap())?;
        // Value compression dictionary length
        file.write_u16::<BE>(self.value_compression_dictionary.len().try_into().unwrap())?;
        // Number of blocks
        file.write_u16::<BE>(self.blocks.len().try_into().unwrap())?;

        // Write the AQMF
        file.write_all(&self.aqmf)?;
        // Write the key compression dictionary
        file.write_all(&self.key_compression_dictionary)?;
        // Write the value compression dictionary
        file.write_all(&self.value_compression_dictionary)?;

        // Write the blocks
        let mut offset = 0;
        for (_, block) in &self.blocks {
            // Block length (including the uncompressed length field)
            let len = block.len() + 4;
            offset += len;
            file.write_u32::<BE>(offset.try_into().unwrap())?;
        }
        for (uncompressed_size, block) in &self.blocks {
            // Uncompressed size
            file.write_u32::<BE>(*uncompressed_size)?;
            // Compressed block
            file.write_all(block)?;
        }
        Ok(file.into_inner()?)
    }
}

/// Builder for a single key block
pub struct KeyBlockBuilder {
    current_entry: usize,
    header_size: usize,
    data: Vec<u8>,
}

/// The size of the key block header.
const KEY_BLOCK_HEADER_SIZE: usize = 4;

impl KeyBlockBuilder {
    /// Creates a new key block builder for the number of entries.
    pub fn new(entry_count: u32) -> Self {
        debug_assert!(entry_count < (1 << 24));

        const ESTIMATED_KEY_SIZE: usize = 16;
        let mut data = Vec::with_capacity(entry_count as usize * ESTIMATED_KEY_SIZE);
        data.write_u8(BLOCK_TYPE_KEY).unwrap();
        data.write_u24::<BE>(entry_count).unwrap();
        for _ in 0..entry_count {
            data.write_u32::<BE>(0).unwrap();
        }
        Self {
            current_entry: 0,
            header_size: data.len(),
            data,
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
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_SMALL as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        self.data.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(&mut self.data);
        self.data.write_u16::<BE>(value_block).unwrap();
        self.data.write_u16::<BE>(value_size).unwrap();
        self.data.write_u32::<BE>(value_offset).unwrap();

        self.current_entry += 1;
    }

    /// Writes a medium-sized value to the buffer.
    pub fn put_medium<E: Entry>(&mut self, entry: &E, value_block: u16) {
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_MEDIUM as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        self.data.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(&mut self.data);
        self.data.write_u16::<BE>(value_block).unwrap();

        self.current_entry += 1;
    }

    /// Writes a tombstone to the buffer.
    pub fn delete<E: Entry>(&mut self, entry: &E) {
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_DELETED as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        self.data.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(&mut self.data);

        self.current_entry += 1;
    }

    /// Writes a blob value to the buffer.
    pub fn put_blob<E: Entry>(&mut self, entry: &E, blob: u32) {
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_BLOB as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        self.data.write_u64::<BE>(entry.key_hash()).unwrap();
        entry.write_key_to(&mut self.data);
        self.data.write_u32::<BE>(blob).unwrap();

        self.current_entry += 1;
    }

    /// Returns the key block buffer
    pub fn finish(self) -> Vec<u8> {
        self.data
    }
}

/// Builder for a single index block.
pub struct IndexBlockBuilder {
    data: Vec<u8>,
}

impl IndexBlockBuilder {
    /// Creates a new builder for an index block with the specified number of entries and a pointer
    /// to the first block.
    pub fn new(entry_count: u16, first_block: u16) -> Self {
        let mut data = Vec::with_capacity(entry_count as usize * 10 + 3);
        data.write_u8(BLOCK_TYPE_INDEX).unwrap();
        data.write_u16::<BE>(first_block).unwrap();
        Self { data }
    }

    /// Adds a hash boundary to the index block.
    pub fn put(&mut self, hash: u64, block: u16) {
        self.data.write_u64::<BE>(hash).unwrap();
        self.data.write_u16::<BE>(block).unwrap();
    }

    /// Returns the index block buffer
    fn finish(self) -> Vec<u8> {
        self.data
    }
}
