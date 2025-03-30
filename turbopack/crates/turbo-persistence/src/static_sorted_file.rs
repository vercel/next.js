use std::{
    cmp::Ordering,
    fs::File,
    hash::BuildHasherDefault,
    mem::{transmute, MaybeUninit},
    path::PathBuf,
    sync::{Arc, OnceLock},
};

use anyhow::{bail, Result};
use byteorder::{ReadBytesExt, BE};
use lzzzz::lz4::decompress_with_dict;
use memmap2::Mmap;
use quick_cache::sync::GuardResult;
use rustc_hash::FxHasher;

use crate::{
    arc_slice::ArcSlice,
    lookup_entry::{LookupEntry, LookupValue},
    QueryKey,
};

/// The block header for an index block.
pub const BLOCK_TYPE_INDEX: u8 = 0;
/// The block header for a key block.
pub const BLOCK_TYPE_KEY: u8 = 1;

/// The tag for a small-sized value.
pub const KEY_BLOCK_ENTRY_TYPE_SMALL: u8 = 0;
/// The tag for the blob value.
pub const KEY_BLOCK_ENTRY_TYPE_BLOB: u8 = 1;
/// The tag for the deleted value.
pub const KEY_BLOCK_ENTRY_TYPE_DELETED: u8 = 2;
/// The tag for a medium-sized value.
pub const KEY_BLOCK_ENTRY_TYPE_MEDIUM: u8 = 3;

/// The result of a lookup operation.
pub enum LookupResult {
    /// The key was deleted.
    Deleted,
    /// The key was found and the value is a slice.
    Slice { value: ArcSlice<u8> },
    /// The key was found and the value is a blob.
    Blob { sequence_number: u32 },
    /// The key was not found because it is out of the range of this SST file.
    RangeMiss,
    /// The key was not found because it was not in the AQMF filter. But it was in the range.
    QuickFilterMiss,
    /// The key was not found. But it was in the range and the AQMF filter.
    KeyMiss,
}

impl From<LookupValue> for LookupResult {
    fn from(value: LookupValue) -> Self {
        match value {
            LookupValue::Deleted => LookupResult::Deleted,
            LookupValue::Slice { value } => LookupResult::Slice { value },
            LookupValue::Blob { sequence_number } => LookupResult::Blob { sequence_number },
        }
    }
}

/// A byte range in the SST file.
struct LocationInFile {
    start: usize,
    end: usize,
}

/// The read and parsed header of an SST file.
struct Header {
    /// The key family stored in this file.
    family: u32,
    /// The minimum hash value in this file.
    min_hash: u64,
    /// The maximum hash value in this file.
    max_hash: u64,
    /// The location of the AQMF filter in the file.
    aqmf: LocationInFile,
    /// The location of the key compression dictionary in the file.
    key_compression_dictionary: LocationInFile,
    /// The location of the value compression dictionary in the file.
    value_compression_dictionary: LocationInFile,
    /// The byte offset where the block offsets start.
    block_offsets_start: usize,
    /// The byte offset where the blocks start.
    blocks_start: usize,
    /// The number of blocks in this file.
    block_count: u16,
}

/// The key family and hash range of an SST file.
#[derive(Clone, Copy)]
pub struct StaticSortedFileRange {
    pub family: u32,
    pub min_hash: u64,
    pub max_hash: u64,
}

#[derive(Clone, Default)]
pub struct AqmfWeighter;

impl quick_cache::Weighter<u32, Arc<qfilter::Filter>> for AqmfWeighter {
    fn weight(&self, _key: &u32, filter: &Arc<qfilter::Filter>) -> u64 {
        filter.capacity() + 1
    }
}

#[derive(Clone, Default)]
pub struct BlockWeighter;

impl quick_cache::Weighter<(u32, u16), ArcSlice<u8>> for BlockWeighter {
    fn weight(&self, _key: &(u32, u16), val: &ArcSlice<u8>) -> u64 {
        val.len() as u64 + 8
    }
}

pub type AqmfCache =
    quick_cache::sync::Cache<u32, Arc<qfilter::Filter>, AqmfWeighter, BuildHasherDefault<FxHasher>>;
pub type BlockCache =
    quick_cache::sync::Cache<(u32, u16), ArcSlice<u8>, BlockWeighter, BuildHasherDefault<FxHasher>>;

/// A memory mapped SST file.
pub struct StaticSortedFile {
    /// The sequence number of this file.
    sequence_number: u32,
    /// The memory mapped file.
    mmap: Mmap,
    /// The parsed header of this file.
    header: OnceLock<Header>,
    /// The AQMF filter of this file. This is only used if the range is very large. Smaller ranges
    /// use the AQMF cache instead.
    aqmf: OnceLock<qfilter::Filter>,
}

impl StaticSortedFile {
    /// The sequence number of this file.
    pub fn sequence_number(&self) -> u32 {
        self.sequence_number
    }

    /// Opens an SST file at the given path. This memory maps the file, but does not read it yet.
    /// It's lazy read on demand.
    pub fn open(sequence_number: u32, path: PathBuf) -> Result<Self> {
        let mmap = unsafe { Mmap::map(&File::open(&path)?)? };
        let file = Self {
            sequence_number,
            mmap,
            header: OnceLock::new(),
            aqmf: OnceLock::new(),
        };
        Ok(file)
    }

    /// Reads and parses the header of this file if it hasn't been read yet.
    fn header(&self) -> Result<&Header> {
        self.header.get_or_try_init(|| {
            let mut file = &*self.mmap;
            let magic = file.read_u32::<BE>()?;
            if magic != 0x53535401 {
                bail!("Invalid magic number or version");
            }
            let family = file.read_u32::<BE>()?;
            let min_hash = file.read_u64::<BE>()?;
            let max_hash = file.read_u64::<BE>()?;
            let aqmf_length = file.read_u24::<BE>()? as usize;
            let key_compression_dictionary_length = file.read_u16::<BE>()? as usize;
            let value_compression_dictionary_length = file.read_u16::<BE>()? as usize;
            let block_count = file.read_u16::<BE>()?;
            const HEADER_SIZE: usize = 33;
            let mut current_offset = HEADER_SIZE;
            let aqmf = LocationInFile {
                start: current_offset,
                end: current_offset + aqmf_length,
            };
            current_offset += aqmf_length;
            let key_compression_dictionary = LocationInFile {
                start: current_offset,
                end: current_offset + key_compression_dictionary_length,
            };
            current_offset += key_compression_dictionary_length;
            let value_compression_dictionary = LocationInFile {
                start: current_offset,
                end: current_offset + value_compression_dictionary_length,
            };
            current_offset += value_compression_dictionary_length;
            let block_offsets_start = current_offset;
            let blocks_start = block_offsets_start + block_count as usize * 4;

            Ok(Header {
                family,
                min_hash,
                max_hash,
                aqmf,
                key_compression_dictionary,
                value_compression_dictionary,
                block_offsets_start,
                blocks_start,
                block_count,
            })
        })
    }

    /// Returns the key family and hash range of this file.
    pub fn range(&self) -> Result<StaticSortedFileRange> {
        let header = self.header()?;
        Ok(StaticSortedFileRange {
            family: header.family,
            min_hash: header.min_hash,
            max_hash: header.max_hash,
        })
    }

    /// Iterate over all entries in this file in sorted order.
    pub fn iter<'l>(
        &'l self,
        key_block_cache: &'l BlockCache,
        value_block_cache: &'l BlockCache,
    ) -> Result<StaticSortedFileIter<'l>> {
        let header = self.header()?;
        let mut iter = StaticSortedFileIter {
            this: self,
            key_block_cache,
            value_block_cache,
            header,
            stack: Vec::new(),
            current_key_block: None,
        };
        iter.enter_block(header.block_count - 1)?;
        Ok(iter)
    }

    /// Looks up a key in this file.
    pub fn lookup<K: QueryKey>(
        &self,
        key_family: u32,
        key_hash: u64,
        key: &K,
        aqmf_cache: &AqmfCache,
        key_block_cache: &BlockCache,
        value_block_cache: &BlockCache,
    ) -> Result<LookupResult> {
        let header = self.header()?;
        if key_family != header.family || key_hash < header.min_hash || key_hash > header.max_hash {
            return Ok(LookupResult::RangeMiss);
        }

        let use_aqmf_cache = header.max_hash - header.min_hash < 1 << 62;
        if use_aqmf_cache {
            let aqmf = match aqmf_cache.get_value_or_guard(&self.sequence_number, None) {
                GuardResult::Value(aqmf) => aqmf,
                GuardResult::Guard(guard) => {
                    let aqmf = &self.mmap[header.aqmf.start..header.aqmf.end];
                    let aqmf: Arc<qfilter::Filter> = Arc::new(pot::from_slice(aqmf)?);
                    let _ = guard.insert(aqmf.clone());
                    aqmf
                }
                GuardResult::Timeout => unreachable!(),
            };
            if !aqmf.contains_fingerprint(key_hash) {
                return Ok(LookupResult::QuickFilterMiss);
            }
        } else {
            let aqmf = self.aqmf.get_or_try_init(|| {
                let aqmf = &self.mmap[header.aqmf.start..header.aqmf.end];
                anyhow::Ok(pot::from_slice(aqmf)?)
            })?;
            if !aqmf.contains_fingerprint(key_hash) {
                return Ok(LookupResult::QuickFilterMiss);
            }
        }
        let mut current_block = header.block_count - 1;
        loop {
            let block = self.get_key_block(header, current_block, key_block_cache)?;
            let mut block = &block[..];
            let block_type = block.read_u8()?;
            match block_type {
                BLOCK_TYPE_INDEX => {
                    current_block = self.lookup_index_block(block, key_hash)?;
                }
                BLOCK_TYPE_KEY => {
                    return self.lookup_key_block(block, key_hash, key, header, value_block_cache);
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
        mut block: &[u8],
        key_hash: u64,
        key: &K,
        header: &Header,
        value_block_cache: &BlockCache,
    ) -> Result<LookupResult> {
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
            } = get_key_entry(offsets, entries, entry_count, m)?;
            match key_hash.cmp(&mid_hash).then_with(|| key.cmp(mid_key)) {
                Ordering::Less => {
                    r = m;
                }
                Ordering::Equal => {
                    return Ok(self
                        .handle_key_match(ty, mid_val, header, value_block_cache)?
                        .into());
                }
                Ordering::Greater => {
                    l = m + 1;
                }
            }
        }
        Ok(LookupResult::KeyMiss)
    }

    /// Handles a key match by looking up the value.
    fn handle_key_match(
        &self,
        ty: u8,
        mut val: &[u8],
        header: &Header,
        value_block_cache: &BlockCache,
    ) -> Result<LookupValue> {
        Ok(match ty {
            KEY_BLOCK_ENTRY_TYPE_SMALL => {
                let block = val.read_u16::<BE>()?;
                let size = val.read_u16::<BE>()? as usize;
                let position = val.read_u32::<BE>()? as usize;
                let value = self
                    .get_value_block(header, block, value_block_cache)?
                    .slice(position..position + size);
                LookupValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
                let block = val.read_u16::<BE>()?;
                let value = self.read_value_block(header, block)?;
                LookupValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_BLOB => {
                let sequence_number = val.read_u32::<BE>()?;
                LookupValue::Blob { sequence_number }
            }
            KEY_BLOCK_ENTRY_TYPE_DELETED => LookupValue::Deleted,
            _ => {
                bail!("Invalid key block entry type");
            }
        })
    }

    /// Gets a key block from the cache or reads it from the file.
    fn get_key_block(
        &self,
        header: &Header,
        block: u16,
        key_block_cache: &BlockCache,
    ) -> Result<ArcSlice<u8>, anyhow::Error> {
        Ok(
            match key_block_cache.get_value_or_guard(&(self.sequence_number, block), None) {
                GuardResult::Value(block) => block,
                GuardResult::Guard(guard) => {
                    let block = self.read_key_block(header, block)?;
                    let _ = guard.insert(block.clone());
                    block
                }
                GuardResult::Timeout => unreachable!(),
            },
        )
    }

    /// Gets a value block from the cache or reads it from the file.
    fn get_value_block(
        &self,
        header: &Header,
        block: u16,
        value_block_cache: &BlockCache,
    ) -> Result<ArcSlice<u8>> {
        let block = match value_block_cache.get_value_or_guard(&(self.sequence_number, block), None)
        {
            GuardResult::Value(block) => block,
            GuardResult::Guard(guard) => {
                let block = self.read_value_block(header, block)?;
                let _ = guard.insert(block.clone());
                block
            }
            GuardResult::Timeout => unreachable!(),
        };
        Ok(block)
    }

    /// Reads a key block from the file.
    fn read_key_block(&self, header: &Header, block_index: u16) -> Result<ArcSlice<u8>> {
        self.read_block(
            header,
            block_index,
            &self.mmap
                [header.key_compression_dictionary.start..header.key_compression_dictionary.end],
        )
    }

    /// Reads a value block from the file.
    fn read_value_block(&self, header: &Header, block_index: u16) -> Result<ArcSlice<u8>> {
        self.read_block(
            header,
            block_index,
            &self.mmap[header.value_compression_dictionary.start
                ..header.value_compression_dictionary.end],
        )
    }

    /// Reads a block from the file.
    fn read_block(
        &self,
        header: &Header,
        block_index: u16,
        compression_dictionary: &[u8],
    ) -> Result<ArcSlice<u8>> {
        #[cfg(feature = "strict_checks")]
        if block_index >= header.block_count {
            bail!(
                "Corrupted file seq:{} block:{} > number of blocks {} (block_offsets: {:x}, \
                 blocks: {:x})",
                self.sequence_number,
                block_index,
                header.block_count,
                header.block_offsets_start,
                header.blocks_start
            );
        }
        let offset = header.block_offsets_start + block_index as usize * 4;
        #[cfg(feature = "strict_checks")]
        if offset + 4 > self.mmap.len() {
            bail!(
                "Corrupted file seq:{} block:{} block offset locations {} + 4 bytes > file end {} \
                 (block_offsets: {:x}, blocks: {:x})",
                self.sequence_number,
                block_index,
                offset,
                self.mmap.len(),
                header.block_offsets_start,
                header.blocks_start
            );
        }
        let block_start = if block_index == 0 {
            header.blocks_start
        } else {
            header.blocks_start + (&self.mmap[offset - 4..offset]).read_u32::<BE>()? as usize
        };
        let block_end =
            header.blocks_start + (&self.mmap[offset..offset + 4]).read_u32::<BE>()? as usize;
        #[cfg(feature = "strict_checks")]
        if block_end > self.mmap.len() || block_start > self.mmap.len() {
            bail!(
                "Corrupted file seq:{} block:{} block {} - {} > file end {} (block_offsets: {:x}, \
                 blocks: {:x})",
                self.sequence_number,
                block_index,
                block_start,
                block_end,
                self.mmap.len(),
                header.block_offsets_start,
                header.blocks_start
            );
        }
        let uncompressed_length =
            (&self.mmap[block_start..block_start + 4]).read_u32::<BE>()? as usize;
        let block = self.mmap[block_start + 4..block_end].to_vec();

        let buffer = Arc::new_zeroed_slice(uncompressed_length);
        // Safety: MaybeUninit<u8> can be safely transmuted to u8.
        let mut buffer = unsafe { transmute::<Arc<[MaybeUninit<u8>]>, Arc<[u8]>>(buffer) };
        // Safety: We know that the buffer is not shared yet.
        let decompressed = unsafe { Arc::get_mut_unchecked(&mut buffer) };
        decompress_with_dict(&block, decompressed, compression_dictionary)?;
        Ok(ArcSlice::from(buffer))
    }
}

/// An iterator over all entries in a SST file in sorted order.
pub struct StaticSortedFileIter<'l> {
    this: &'l StaticSortedFile,
    key_block_cache: &'l BlockCache,
    value_block_cache: &'l BlockCache,
    header: &'l Header,

    stack: Vec<CurrentIndexBlock>,
    current_key_block: Option<CurrentKeyBlock>,
}

struct CurrentKeyBlock {
    offsets: ArcSlice<u8>,
    entries: ArcSlice<u8>,
    entry_count: usize,
    index: usize,
}

struct CurrentIndexBlock {
    entries: ArcSlice<u8>,
    block_indicies_count: usize,
    index: usize,
}

impl Iterator for StaticSortedFileIter<'_> {
    type Item = Result<LookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        self.next_internal().transpose()
    }
}

impl StaticSortedFileIter<'_> {
    /// Enters a block at the given index.
    fn enter_block(&mut self, block_index: u16) -> Result<()> {
        let block_arc = self
            .this
            .get_key_block(self.header, block_index, self.key_block_cache)?;
        let mut block = &*block_arc;
        let block_type = block.read_u8()?;
        match block_type {
            BLOCK_TYPE_INDEX => {
                let block_indicies_count = (block.len() + 8) / 10;
                let range = 1..block_arc.len();
                self.stack.push(CurrentIndexBlock {
                    entries: block_arc.slice(range),
                    block_indicies_count,
                    index: 0,
                });
            }
            BLOCK_TYPE_KEY => {
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
            }) = self.current_key_block.take()
            {
                let GetKeyEntryResult { hash, key, ty, val } =
                    get_key_entry(&offsets, &entries, entry_count, index)?;
                let value =
                    self.this
                        .handle_key_match(ty, val, self.header, self.value_block_cache)?;
                let entry = LookupEntry {
                    hash,
                    // Safety: The key is a valid slice of the entries.
                    key: unsafe { ArcSlice::new_unchecked(key, ArcSlice::full_arc(&entries)) },
                    value,
                };
                if index + 1 < entry_count {
                    self.current_key_block = Some(CurrentKeyBlock {
                        offsets,
                        entries,
                        entry_count,
                        index: index + 1,
                    });
                }
                return Ok(Some(entry));
            }
            if let Some(CurrentIndexBlock {
                entries,
                block_indicies_count,
                index,
            }) = self.stack.pop()
            {
                let block_index = (&entries[index * 10..]).read_u16::<BE>()?;
                if index + 1 < block_indicies_count {
                    self.stack.push(CurrentIndexBlock {
                        entries,
                        block_indicies_count,
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
    hash: u64,
    key: &'l [u8],
    ty: u8,
    val: &'l [u8],
}

/// Reads a key entry from a key block.
fn get_key_entry<'l>(
    offsets: &[u8],
    entries: &'l [u8],
    entry_count: usize,
    index: usize,
) -> Result<GetKeyEntryResult<'l>> {
    let mut offset = &offsets[index * 4..];
    let ty = offset.read_u8()?;
    let start = offset.read_u24::<BE>()? as usize;
    let end = if index == entry_count - 1 {
        entries.len()
    } else {
        (&offsets[(index + 1) * 4 + 1..]).read_u24::<BE>()? as usize
    };
    let hash = (&entries[start..start + 8]).read_u64::<BE>()?;
    Ok(match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => GetKeyEntryResult {
            hash,
            key: &entries[start + 8..end - 8],
            ty,
            val: &entries[end - 8..end],
        },
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => GetKeyEntryResult {
            hash,
            key: &entries[start + 8..end - 2],
            ty,
            val: &entries[end - 2..end],
        },
        KEY_BLOCK_ENTRY_TYPE_BLOB => GetKeyEntryResult {
            hash,
            key: &entries[start + 8..end - 4],
            ty,
            val: &entries[end - 4..end],
        },
        KEY_BLOCK_ENTRY_TYPE_DELETED => GetKeyEntryResult {
            hash,
            key: &entries[start + 8..end],
            ty,
            val: &[],
        },
        _ => {
            bail!("Invalid key block entry type");
        }
    })
}
