use std::{
    cmp::min,
    fs::File,
    io::{self, BufWriter, Write},
    path::Path,
};

use byteorder::{ByteOrder, WriteBytesExt, BE};
use lzzzz::lz4::{max_compressed_size, ACC_LEVEL_DEFAULT};

use crate::{
    entry::{Entry, EntryValue},
    key::{HashKey, StoreKey},
    static_sorted_file::{
        BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY, KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_DELETED,
        KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_NORMAL,
    },
};

const MAX_KEY_BLOCK_ENTRIES: usize = 100 * 1024;
const MAX_KEY_BLOCK_SIZE: usize = 16 * 1024 * 1024 - 1;
const MAX_VALUE_BLOCK_ENTRIES: usize = 100 * 1024;
const MAX_VALUE_BLOCK_SIZE: usize = 16 * 1024 * 1024;
const AQMF_FALSE_POSITIVE_RATE: f64 = 0.01;
const VALUE_COMPRESSION_DICTIONARY_SIZE: usize = 64 * 1024 - 1;
const KEY_COMPRESSION_DICTIONARY_SIZE: usize = 64 * 1024 - 1;
const COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY: usize = 100;

#[derive(Debug, Default)]
pub struct StaticSortedFileBuilder {
    aqmf: Vec<u8>,
    key_compression_dictionary: Vec<u8>,
    value_compression_dictionary: Vec<u8>,
    blocks: Vec<(u32, Vec<u8>)>,
}

impl StaticSortedFileBuilder {
    pub fn new<K: StoreKey>(
        entries: &[Entry<K>],
        total_key_size: usize,
        total_value_size: usize,
    ) -> Self {
        let mut builder = Self::default();
        builder.compute_aqmf(entries);
        builder.compute_compression_dictionary(entries, total_key_size, total_value_size);
        builder.compute_blocks(entries);
        builder
    }

    fn compute_aqmf<K: StoreKey>(&mut self, entries: &[Entry<K>]) {
        let mut filter = qfilter::Filter::new(entries.len() as u64, AQMF_FALSE_POSITIVE_RATE)
            // This won't fail as we limit the number of entries per SST file
            .expect("Filter can't be constructed");
        for entry in entries {
            filter
                .insert(&HashKey(&entry.key))
                // This can't fail as we allocated enough capacity
                .expect("AQMF insert failed");
        }
        self.aqmf = pot::to_vec(&filter).expect("AQMF serialization failed");
    }

    fn compute_compression_dictionary<K: StoreKey>(
        &mut self,
        entries: &[Entry<K>],
        total_key_size: usize,
        total_value_size: usize,
    ) {
        // TODO actually train the dictionary
        let key_compression_dictionary_size =
            min(KEY_COMPRESSION_DICTIONARY_SIZE, total_key_size / 10);
        let value_compression_dictionary_size =
            min(VALUE_COMPRESSION_DICTIONARY_SIZE, total_value_size / 10);
        self.value_compression_dictionary = Vec::with_capacity(value_compression_dictionary_size);
        self.key_compression_dictionary = Vec::with_capacity(key_compression_dictionary_size);
        let mut i = 12345678 % entries.len();
        let mut j = 0;
        loop {
            let entry = &entries[i];
            let value_remaining =
                value_compression_dictionary_size - self.value_compression_dictionary.len();
            let key_remaining =
                key_compression_dictionary_size - self.key_compression_dictionary.len();
            if value_remaining > 0 {
                if let EntryValue::Small { value } | EntryValue::Medium { value } = &entry.value {
                    let value = if value.len() <= COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY {
                        &value
                    } else {
                        j = (j + 12345678)
                            % (value.len() - COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY);
                        &value[j..j + COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY]
                    };
                    if value.len() <= value_remaining {
                        self.value_compression_dictionary.extend_from_slice(value);
                    } else {
                        self.value_compression_dictionary
                            .extend_from_slice(&value[..value_remaining]);
                    }
                }
            }
            if key_remaining > 0 {
                let key = &entry.key;
                let used_len = min(key_remaining, COMPRESSION_DICTIONARY_SAMPLE_PER_ENTRY);
                if key.len() <= used_len {
                    key.write_to(&mut self.key_compression_dictionary);
                } else {
                    let mut temp = Vec::with_capacity(key.len());
                    key.write_to(&mut temp);

                    j = (j + 12345678) % (temp.len() - used_len);
                    self.key_compression_dictionary
                        .extend_from_slice(&temp[j..j + used_len]);
                }
            }
            if key_remaining == 0 && value_remaining == 0 {
                break;
            }
            i = (i + 12345678) % entries.len();
        }
    }

    fn compute_blocks<K: StoreKey>(&mut self, entries: &[Entry<K>]) {
        // TODO implement multi level index
        // TODO place key and value block near to each other

        // For now we use something simple to implement:
        // Block 0 is Index block
        // Followed by all Value blocks
        // And the rest are the Key blocks

        // Reserve the first block for the index block
        self.blocks.push((0, Vec::new()));

        // Store the locations of the values
        let mut value_locations: Vec<(usize, usize)> = Vec::with_capacity(entries.len());

        // Split the values into blocks
        let mut current_block_start = 0;
        let mut current_block_count = 0;
        let mut current_block_size = 0;
        for (i, entry) in entries.iter().enumerate() {
            match &entry.value {
                EntryValue::Small { value } => {
                    if current_block_size + value.len() > MAX_VALUE_BLOCK_SIZE
                        || current_block_count + 1 >= MAX_VALUE_BLOCK_ENTRIES
                    {
                        let block_index = self.blocks.len();
                        let mut block = Vec::with_capacity(current_block_size);
                        for j in current_block_start..i {
                            if let EntryValue::Small { value } = &entries[j].value {
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
                if let EntryValue::Small { value } = &entries[j].value {
                    block.extend_from_slice(value);
                    value_locations[j].0 = block_index;
                }
            }
            self.blocks.push(self.compress_value_block(&block));
        }

        let mut key_block_boundaries = Vec::new();
        key_block_boundaries.push((0, 0));

        // Split the keys into blocks
        fn add_entry_to_block<K: StoreKey>(
            entry: &Entry<K>,
            value_location: &(usize, usize),
            block: &mut KeyBlockBuilder,
        ) {
            match &entry.value {
                EntryValue::Small { value } => {
                    block.put(
                        &entry.key,
                        value_location.0.try_into().unwrap(),
                        value_location.1.try_into().unwrap(),
                        value.len().try_into().unwrap(),
                    );
                }
                EntryValue::Medium { .. } => {
                    block.put_medium(&entry.key, value_location.0.try_into().unwrap());
                }
                EntryValue::Large { blob } => {
                    block.put_blob(&entry.key, *blob);
                }
                EntryValue::Deleted => {
                    block.delete(&entry.key);
                }
            }
        }
        let mut current_block_start = 0;
        let mut current_block_size = 0;
        for (i, entry) in entries.iter().enumerate() {
            if current_block_size + entry.key.len() > MAX_KEY_BLOCK_SIZE
                || i - current_block_start >= MAX_KEY_BLOCK_ENTRIES
            {
                let mut block = KeyBlockBuilder::new((i - current_block_start) as u32);
                for j in current_block_start..i {
                    let entry = &entries[j];
                    let value_location = &value_locations[j];
                    add_entry_to_block(entry, value_location, &mut block);
                }
                key_block_boundaries.push((self.blocks.len(), i - 1));
                self.blocks.push(self.compress_key_block(&block.finish()));
                current_block_size = 0;
                current_block_start = i;
            }
            current_block_size += entry.key.len();
        }
        if current_block_size > 0 {
            let mut block = KeyBlockBuilder::new((entries.len() - current_block_start) as u32);
            for j in current_block_start..entries.len() {
                let entry = &entries[j];
                let value_location = &value_locations[j];
                add_entry_to_block(entry, value_location, &mut block);
            }
            key_block_boundaries.push((self.blocks.len(), entries.len() - 1));
            self.blocks.push(self.compress_key_block(&block.finish()));
        }

        // Compute the index
        let mut index_block = IndexBlockBuilder::new(
            key_block_boundaries.len() as u16,
            &entries[key_block_boundaries[0].1].key,
        );
        for (block, entry_index) in &key_block_boundaries[1..] {
            index_block.put(*block as u16, &entries[*entry_index].key);
        }
        self.blocks[0] = self.compress_key_block(&index_block.finish());
    }

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

    fn compress_key_block(&self, block: &[u8]) -> (u32, Vec<u8>) {
        self.compress_block(block, &self.key_compression_dictionary)
    }

    fn compress_value_block(&self, block: &[u8]) -> (u32, Vec<u8>) {
        self.compress_block(block, &self.value_compression_dictionary)
    }

    pub fn write(&self, file: &Path) -> io::Result<File> {
        let mut file = BufWriter::new(File::create(file)?);
        // magic number and version
        file.write_u32::<BE>(0x53535401)?;
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

pub struct KeyBlockBuilder {
    current_entry: usize,
    header_size: usize,
    data: Vec<u8>,
}

const KEY_BLOCK_HEADER_SIZE: usize = 4;

impl KeyBlockBuilder {
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

    pub fn put<K: StoreKey>(
        &mut self,
        key: K,
        value_block: u16,
        value_offset: u32,
        value_size: u32,
    ) {
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_NORMAL as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        key.write_to(&mut self.data);
        self.data.write_u16::<BE>(value_block).unwrap();
        self.data.write_u24::<BE>(value_size).unwrap();
        self.data.write_u32::<BE>(value_offset).unwrap();

        self.current_entry += 1;
    }

    pub fn put_medium<K: StoreKey>(&mut self, key: K, value_block: u16) {
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_MEDIUM as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        key.write_to(&mut self.data);
        self.data.write_u16::<BE>(value_block).unwrap();

        self.current_entry += 1;
    }

    pub fn delete<K: StoreKey>(&mut self, key: K) {
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_DELETED as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        key.write_to(&mut self.data);

        self.current_entry += 1;
    }

    pub fn put_blob<K: StoreKey>(&mut self, key: K, blob: u32) {
        let pos = self.data.len() - self.header_size;
        let header_offset = KEY_BLOCK_HEADER_SIZE + self.current_entry * 4;
        let header = (pos as u32) | ((KEY_BLOCK_ENTRY_TYPE_BLOB as u32) << 24);
        BE::write_u32(&mut self.data[header_offset..header_offset + 4], header);

        key.write_to(&mut self.data);
        self.data.write_u32::<BE>(blob).unwrap();

        self.current_entry += 1;
    }

    pub fn finish(self) -> Vec<u8> {
        self.data
    }
}

pub struct IndexBlockBuilder {
    current_entry: usize,
    header_size: usize,
    data: Vec<u8>,
}

const INDEX_BLOCK_HEADER_SIZE: usize = 3;

impl IndexBlockBuilder {
    pub fn new<K: StoreKey>(entry_count: u16, first_key: K) -> Self {
        const ESTIMATED_KEY_SIZE: usize = 16;
        let mut data = Vec::with_capacity(entry_count as usize * ESTIMATED_KEY_SIZE);
        data.write_u8(BLOCK_TYPE_INDEX).unwrap();
        data.write_u16::<BE>(entry_count as u16).unwrap();
        for _ in 0..entry_count - 1 {
            data.write_u16::<BE>(0).unwrap();
        }
        let header_size = data.len();
        first_key.write_to(&mut data);
        Self {
            current_entry: 0,
            header_size,
            data,
        }
    }

    pub fn put<K: StoreKey>(&mut self, block: u16, key: K) {
        self.data.write_u16::<BE>(block).unwrap();

        let pos = self.data.len() - self.header_size;
        let header_offset = INDEX_BLOCK_HEADER_SIZE + self.current_entry * 2;
        let header = pos as u16;
        BE::write_u16(&mut self.data[header_offset..header_offset + 2], header);

        key.write_to(&mut self.data);

        self.current_entry += 1;
    }

    fn finish(self) -> Vec<u8> {
        self.data
    }
}
