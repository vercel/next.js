use std::{
    cmp::Ordering,
    fs::File,
    hash::BuildHasherDefault,
    ops::Range,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt};
use memmap2::Mmap;
use quick_cache::sync::GuardResult;
use rustc_hash::FxHasher;

use crate::{
    QueryKey,
    arc_slice::ArcSlice,
    compression::decompress_into_arc,
    lookup_entry::{LazyLookupValue, LookupEntry, LookupValue},
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
pub enum SstLookupResult {
    /// The key was found.
    Found(LookupValue),
    /// The key was not found.
    NotFound,
}

impl From<LookupValue> for SstLookupResult {
    fn from(value: LookupValue) -> Self {
        SstLookupResult::Found(value)
    }
}

#[derive(Clone, Default)]
pub struct BlockWeighter;

impl quick_cache::Weighter<(u32, u16), ArcSlice<u8>> for BlockWeighter {
    fn weight(&self, _key: &(u32, u16), val: &ArcSlice<u8>) -> u64 {
        val.len() as u64 + 8
    }
}

pub type BlockCache =
    quick_cache::sync::Cache<(u32, u16), ArcSlice<u8>, BlockWeighter, BuildHasherDefault<FxHasher>>;

#[derive(Clone, Debug)]
pub struct StaticSortedFileMetaData {
    /// The sequence number of this file.
    pub sequence_number: u32,
    /// The length of the key compression dictionary.
    pub key_compression_dictionary_length: u16,
    /// The number of blocks in the SST file.
    pub block_count: u16,
}

impl StaticSortedFileMetaData {
    pub fn block_offsets_start(&self, sst_len: usize) -> usize {
        let bc: usize = self.block_count.into();
        sst_len - (bc * size_of::<u32>())
    }

    pub fn blocks_start(&self) -> usize {
        let k: usize = self.key_compression_dictionary_length.into();
        k
    }

    pub fn key_compression_dictionary_range(&self) -> Range<usize> {
        let start = 0;
        let end: usize = self.key_compression_dictionary_length.into();
        start..end
    }
}

/// A memory mapped SST file.
pub struct StaticSortedFile {
    /// The meta file of this file.
    meta: StaticSortedFileMetaData,
    /// The memory mapped file.
    mmap: Mmap,
}

impl StaticSortedFile {
    /// Opens an SST file at the given path. This memory maps the file, but does not read it yet.
    /// It's lazy read on demand.
    pub fn open(db_path: &Path, meta: StaticSortedFileMetaData) -> Result<Self> {
        let filename = format!("{:08}.sst", meta.sequence_number);
        let path = db_path.join(&filename);
        Self::open_internal(path, meta)
            .with_context(|| format!("Unable to open static sorted file {filename}"))
    }

    fn open_internal(path: PathBuf, meta: StaticSortedFileMetaData) -> Result<Self> {
        let mmap = unsafe { Mmap::map(&File::open(&path)?)? };
        #[cfg(unix)]
        mmap.advise(memmap2::Advice::Random)?;
        #[cfg(unix)]
        {
            let offset = meta.block_offsets_start(mmap.len());
            let _ = mmap.advise_range(memmap2::Advice::Sequential, offset, mmap.len() - offset);
        }
        let file = Self { meta, mmap };
        Ok(file)
    }

    /// Iterate over all entries in this file in sorted order.
    pub fn iter<'l>(
        &'l self,
        key_block_cache: &'l BlockCache,
        value_block_cache: &'l BlockCache,
    ) -> Result<StaticSortedFileIter<'l>> {
        let mut iter = StaticSortedFileIter {
            this: self,
            key_block_cache,
            value_block_cache,
            stack: Vec::new(),
            current_key_block: None,
        };
        iter.enter_block(self.meta.block_count - 1)?;
        Ok(iter)
    }

    /// Looks up a key in this file.
    pub fn lookup<K: QueryKey>(
        &self,
        key_hash: u64,
        key: &K,
        key_block_cache: &BlockCache,
        value_block_cache: &BlockCache,
    ) -> Result<SstLookupResult> {
        let mut current_block = self.meta.block_count - 1;
        loop {
            let block = self.get_key_block(current_block, key_block_cache)?;
            let mut block = &block[..];
            let block_type = block.read_u8()?;
            match block_type {
                BLOCK_TYPE_INDEX => {
                    current_block = self.lookup_index_block(block, key_hash)?;
                }
                BLOCK_TYPE_KEY => {
                    return self.lookup_key_block(block, key_hash, key, value_block_cache);
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
        value_block_cache: &BlockCache,
    ) -> Result<SstLookupResult> {
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
                        .handle_key_match(ty, mid_val, value_block_cache)?
                        .into());
                }
                Ordering::Greater => {
                    l = m + 1;
                }
            }
        }
        Ok(SstLookupResult::NotFound)
    }

    /// Handles a key match by looking up the value.
    fn handle_key_match(
        &self,
        ty: u8,
        mut val: &[u8],
        value_block_cache: &BlockCache,
    ) -> Result<LookupValue> {
        Ok(match ty {
            KEY_BLOCK_ENTRY_TYPE_SMALL => {
                let block = val.read_u16::<BE>()?;
                let size = val.read_u16::<BE>()? as usize;
                let position = val.read_u32::<BE>()? as usize;
                let value = self
                    .get_value_block(block, value_block_cache)?
                    .slice(position..position + size);
                LookupValue::Slice { value }
            }
            KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
                let block = val.read_u16::<BE>()?;
                let value = self.read_value_block(block)?;
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
        block: u16,
        key_block_cache: &BlockCache,
    ) -> Result<ArcSlice<u8>, anyhow::Error> {
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

    /// Gets a value block from the cache or reads it from the file.
    fn get_value_block(&self, block: u16, value_block_cache: &BlockCache) -> Result<ArcSlice<u8>> {
        let block =
            match value_block_cache.get_value_or_guard(&(self.meta.sequence_number, block), None) {
                GuardResult::Value(block) => block,
                GuardResult::Guard(guard) => {
                    let block = self.read_small_value_block(block)?;
                    let _ = guard.insert(block.clone());
                    block
                }
                GuardResult::Timeout => unreachable!(),
            };
        Ok(block)
    }

    /// Reads a key block from the file.
    fn read_key_block(&self, block_index: u16) -> Result<ArcSlice<u8>> {
        self.read_block(
            block_index,
            Some(&self.mmap[self.meta.key_compression_dictionary_range()]),
            false,
        )
    }

    /// Reads a value block from the file.
    fn read_small_value_block(&self, block_index: u16) -> Result<ArcSlice<u8>> {
        self.read_block(block_index, None, false)
    }

    /// Reads a value block from the file.
    fn read_value_block(&self, block_index: u16) -> Result<ArcSlice<u8>> {
        self.read_block(block_index, None, true)
    }

    /// Reads a block from the file.
    #[tracing::instrument(level = "info", name = "reading database block", skip_all)]
    fn read_block(
        &self,
        block_index: u16,
        compression_dictionary: Option<&[u8]>,
        long_term: bool,
    ) -> Result<ArcSlice<u8>> {
        let (uncompressed_length, block) = self.get_compressed_block(block_index)?;

        let buffer = decompress_into_arc(
            uncompressed_length,
            block,
            compression_dictionary,
            long_term,
        )?;
        Ok(ArcSlice::from(buffer))
    }

    /// Gets the slice of the compressed block from the memory mapped file.
    fn get_compressed_block(&self, block_index: u16) -> Result<(u32, &[u8])> {
        #[cfg(feature = "strict_checks")]
        if block_index >= self.meta.block_count {
            bail!(
                "Corrupted file seq:{} block:{} > number of blocks {} (block_offsets: {:x}, \
                 blocks: {:x})",
                self.meta.sequence_number,
                block_index,
                self.meta.block_count,
                self.meta.block_offsets_start(self.mmap.len()),
                self.meta.blocks_start()
            );
        }
        let offset = self.meta.block_offsets_start(self.mmap.len()) + block_index as usize * 4;
        #[cfg(feature = "strict_checks")]
        if offset + 4 > self.mmap.len() {
            bail!(
                "Corrupted file seq:{} block:{} block offset locations {} + 4 bytes > file end {} \
                 (block_offsets: {:x}, blocks: {:x})",
                self.meta.sequence_number,
                block_index,
                offset,
                self.mmap.len(),
                self.meta.block_offsets_start(self.mmap.len()),
                self.meta.blocks_start()
            );
        }
        let block_start = if block_index == 0 {
            self.meta.blocks_start()
        } else {
            self.meta.blocks_start() + (&self.mmap[offset - 4..offset]).read_u32::<BE>()? as usize
        };
        let block_end =
            self.meta.blocks_start() + (&self.mmap[offset..offset + 4]).read_u32::<BE>()? as usize;
        #[cfg(feature = "strict_checks")]
        if block_end > self.mmap.len() || block_start > self.mmap.len() {
            bail!(
                "Corrupted file seq:{} block:{} block {} - {} > file end {} (block_offsets: {:x}, \
                 blocks: {:x})",
                self.meta.sequence_number,
                block_index,
                block_start,
                block_end,
                self.mmap.len(),
                self.meta.block_offsets_start(self.mmap.len()),
                self.meta.blocks_start()
            );
        }
        #[cfg(unix)]
        let _ = self.mmap.advise_range(
            memmap2::Advice::Sequential,
            block_start,
            block_end - block_start,
        );
        let uncompressed_length = (&self.mmap[block_start..block_start + 4]).read_u32::<BE>()?;
        let block = &self.mmap[block_start + 4..block_end];
        Ok((uncompressed_length, block))
    }
}

/// An iterator over all entries in a SST file in sorted order.
pub struct StaticSortedFileIter<'l> {
    this: &'l StaticSortedFile,
    key_block_cache: &'l BlockCache,
    value_block_cache: &'l BlockCache,

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
    block_indices_count: usize,
    index: usize,
}

impl<'l> Iterator for StaticSortedFileIter<'l> {
    type Item = Result<LookupEntry<'l>>;

    fn next(&mut self) -> Option<Self::Item> {
        self.next_internal().transpose()
    }
}

impl<'l> StaticSortedFileIter<'l> {
    /// Enters a block at the given index.
    fn enter_block(&mut self, block_index: u16) -> Result<()> {
        let block_arc = self.this.get_key_block(block_index, self.key_block_cache)?;
        let mut block = &*block_arc;
        let block_type = block.read_u8()?;
        match block_type {
            BLOCK_TYPE_INDEX => {
                let block_indices_count = (block.len() + 8) / 10;
                let range = 1..block_arc.len();
                self.stack.push(CurrentIndexBlock {
                    entries: block_arc.slice(range),
                    block_indices_count,
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
    fn next_internal(&mut self) -> Result<Option<LookupEntry<'l>>> {
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
                let value = if ty == KEY_BLOCK_ENTRY_TYPE_MEDIUM {
                    let mut val = val;
                    let block = val.read_u16::<BE>()?;
                    let (uncompressed_size, block) = self.this.get_compressed_block(block)?;
                    LazyLookupValue::Medium {
                        uncompressed_size,
                        block,
                    }
                } else {
                    let value = self
                        .this
                        .handle_key_match(ty, val, self.value_block_cache)?;
                    LazyLookupValue::Eager(value)
                };
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
                block_indices_count,
                index,
            }) = self.stack.pop()
            {
                let block_index = (&entries[index * 10..]).read_u16::<BE>()?;
                if index + 1 < block_indices_count {
                    self.stack.push(CurrentIndexBlock {
                        entries,
                        block_indices_count,
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
