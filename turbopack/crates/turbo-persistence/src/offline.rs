//! Shared helpers for offline inspection of persistence SST files.

use std::{
    collections::{BTreeMap, HashSet},
    mem::size_of,
    path::Path,
};

use anyhow::{Context, Result, bail, ensure};
use byteorder::{BE, ReadBytesExt};
use fs_err::{self as fs, File};
use lzzzz::lz4::decompress;
use memmap2::Mmap;

use crate::{
    BLOCK_HEADER_SIZE, Compression, checksum_block,
    meta_file::MetaFile,
    mmap_helper::advise_mmap_for_persistence,
    read_current_version,
    sst_filter::SstFilter,
    static_sorted_file::{
        BLOB_VALUE_REF_SIZE, BLOCK_TYPE_FIXED_KEY_NO_HASH, BLOCK_TYPE_FIXED_KEY_WITH_HASH,
        BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY_NO_HASH, BLOCK_TYPE_KEY_WITH_HASH,
        FIXED_KEY_BLOCK_MIXED_VALUE_TYPE, KEY_BLOCK_ENTRY_TYPE_BLOB,
        KEY_BLOCK_ENTRY_TYPE_INLINE_MIN, KEY_BLOCK_ENTRY_TYPE_KEY_DELETED,
        KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN, KEY_BLOCK_ENTRY_TYPE_MEDIUM,
        KEY_BLOCK_ENTRY_TYPE_SMALL, KEY_DELETED_REF_SIZE, MEDIUM_VALUE_REF_SIZE,
        SMALL_VALUE_REF_SIZE,
    },
};

const KEY_BLOCK_HEADER_SIZE: usize = 4;
pub const MIN_KEY_SIZE_FOR_COMPRESSION: usize = 16;

/// Information about an active SST file recorded by a meta file.
#[derive(Clone, Copy, Debug)]
pub struct SstInfo {
    pub sequence_number: u32,
    pub block_count: u16,
    pub compression: Compression,
}

/// Collects active SSTs by family, mirroring database open logic.
pub fn collect_sst_info(db_path: &Path) -> Result<BTreeMap<u32, Vec<SstInfo>>> {
    let current = read_current_version(db_path)?
        .context("CURRENT file is missing")?
        .max_sequence_number;

    let mut deleted_seqs = HashSet::new();
    for entry in fs::read_dir(db_path)
        .with_context(|| format!("Failed to read database directory {}", db_path.display()))?
    {
        let path = entry?.path();
        if path.extension().and_then(|s| s.to_str()) == Some("del") {
            let content = fs::read(&path)
                .with_context(|| format!("Failed to read deletion file {}", path.display()))?;
            let mut cursor: &[u8] = &content;
            while !cursor.is_empty() {
                deleted_seqs.insert(
                    cursor.read_u32::<BE>().with_context(|| {
                        format!("Truncated sequence number in {}", path.display())
                    })?,
                );
            }
        }
    }

    let mut meta_seqs: Vec<u32> = fs::read_dir(db_path)?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("meta") {
                return None;
            }
            let sequence: u32 = path.file_stem()?.to_str()?.parse().ok()?;
            (sequence <= current && !deleted_seqs.contains(&sequence)).then_some(sequence)
        })
        .collect();

    if meta_seqs.is_empty() {
        bail!("No active .meta files found in {}", db_path.display());
    }
    meta_seqs.sort_unstable();

    let mut meta_files: Vec<MetaFile> = meta_seqs
        .iter()
        .map(|&sequence| {
            MetaFile::open(db_path, sequence, None)
                .with_context(|| format!("Failed to open {sequence:08}.meta"))
        })
        .collect::<Result<_>>()?;

    let mut sst_filter = SstFilter::new();
    for meta in meta_files.iter_mut().rev() {
        sst_filter.apply_filter(meta);
    }

    let mut families: BTreeMap<u32, Vec<SstInfo>> = BTreeMap::new();
    for meta in &meta_files {
        for entry in meta.entries() {
            families.entry(meta.family()).or_default().push(SstInfo {
                sequence_number: entry.sequence_number(),
                block_count: entry.block_count(),
                compression: meta.compression(),
            });
        }
    }
    Ok(families)
}

/// A checksummed block reconstructed to its original bytes.
pub struct RawBlock {
    pub data: Box<[u8]>,
    pub stored_size: u64,
    pub actual_size: u64,
    pub was_compressed: bool,
}

/// Reads, checksums, and decompresses a single SST block.
pub fn read_block(
    mmap: &Mmap,
    block_offsets_start: usize,
    block_index: u16,
    sequence_number: u32,
    compression: Compression,
) -> Result<RawBlock> {
    let offset = block_offsets_start
        .checked_add(block_index as usize * size_of::<u32>())
        .context("Block offset overflow")?;
    let end_bytes = mmap
        .get(offset..offset + size_of::<u32>())
        .with_context(|| {
            format!(
                "Block {block_index} directory entry is out of bounds in {sequence_number:08}.sst"
            )
        })?;
    let block_end = (&end_bytes[..]).read_u32::<BE>()? as usize;
    let block_start = if block_index == 0 {
        0
    } else {
        let start_bytes = mmap
            .get(offset - size_of::<u32>()..offset)
            .with_context(|| format!("Block {block_index} start offset is out of bounds"))?;
        (&start_bytes[..]).read_u32::<BE>()? as usize
    };
    ensure!(
        block_end >= block_start + BLOCK_HEADER_SIZE && block_end <= block_offsets_start,
        "Invalid bounds {block_start}..{block_end} for block {block_index} in \
         {sequence_number:08}.sst"
    );

    let header = mmap
        .get(block_start..block_start + BLOCK_HEADER_SIZE)
        .with_context(|| format!("Truncated header for block {block_index}"))?;
    let uncompressed_length = (&header[..4]).read_u32::<BE>()?;
    let expected_checksum = (&header[4..]).read_u32::<BE>()?;
    let stored_data = mmap
        .get(block_start + BLOCK_HEADER_SIZE..block_end)
        .with_context(|| format!("Truncated payload for block {block_index}"))?;
    let actual_checksum = checksum_block(stored_data);
    ensure!(
        actual_checksum == expected_checksum,
        "Checksum mismatch in block {block_index} of {sequence_number:08}.sst (expected \
         {expected_checksum:08x}, got {actual_checksum:08x})"
    );

    let was_compressed = uncompressed_length > 0;
    let data = if was_compressed {
        let mut output = vec![0; uncompressed_length as usize];
        let written = match compression {
            Compression::Lz4 => decompress(stored_data, &mut output)
                .map_err(anyhow::Error::from)
                .context("LZ4 decompression failed"),
            Compression::Zstd3 => zstd::bulk::decompress_to_buffer(stored_data, &mut output)
                .map_err(anyhow::Error::from)
                .context("zstd decompression failed"),
        }
        .with_context(|| {
            format!("Failed to decompress block {block_index} of {sequence_number:08}.sst")
        })?;
        ensure!(
            written == uncompressed_length as usize,
            "Decompressed block {block_index} of {sequence_number:08}.sst to {written} bytes, \
             expected {uncompressed_length}"
        );
        output.into_boxed_slice()
    } else {
        Box::from(stored_data)
    };

    Ok(RawBlock {
        actual_size: data.len() as u64,
        stored_size: stored_data.len() as u64,
        data,
        was_compressed,
    })
}

/// Parses an index block and returns all key-block indices.
pub fn parse_key_block_indices(index_block: &[u8]) -> Result<HashSet<u16>> {
    ensure!(index_block.len() >= 3, "Index block is too small");
    ensure!(
        index_block[0] == BLOCK_TYPE_INDEX,
        "Invalid index block type"
    );
    let mut data = &index_block[1..];
    let first_block = data.read_u16::<BE>()?;
    let mut indices = HashSet::from([first_block]);
    const ENTRY_SIZE: usize = size_of::<u64>() + size_of::<u16>();
    let (entries, remainder) = data.as_chunks::<ENTRY_SIZE>();
    ensure!(remainder.is_empty(), "Index block has a truncated entry");
    for entry in entries {
        indices.insert((&entry[size_of::<u64>()..]).read_u16::<BE>()?);
    }
    Ok(indices)
}

/// Parsed key-block layout used by both offline tools.
#[derive(Clone, Copy)]
pub enum KeyBlockHeader {
    Variable {
        entry_count: u32,
        hash_len: usize,
    },
    Fixed {
        entry_count: u32,
        hash_len: usize,
        key_size: usize,
        value_type: u8,
    },
    FixedMixedType {
        entry_count: u32,
        hash_len: usize,
        key_size: usize,
        stride: usize,
    },
}

impl KeyBlockHeader {
    pub fn entry_count(self) -> u32 {
        match self {
            Self::Variable { entry_count, .. }
            | Self::Fixed { entry_count, .. }
            | Self::FixedMixedType { entry_count, .. } => entry_count,
        }
    }
}

/// Parses a key-block header.
pub fn parse_key_block_header(block: &[u8]) -> Result<KeyBlockHeader> {
    ensure!(
        block.len() >= KEY_BLOCK_HEADER_SIZE,
        "Key block is too small"
    );
    let block_type = block[0];
    let entry_count = ((block[1] as u32) << 16) | ((block[2] as u32) << 8) | block[3] as u32;
    let hash_len = match block_type {
        BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_FIXED_KEY_WITH_HASH => size_of::<u64>(),
        BLOCK_TYPE_KEY_NO_HASH | BLOCK_TYPE_FIXED_KEY_NO_HASH => 0,
        _ => bail!("Invalid key block type {block_type}"),
    };
    match block_type {
        BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => Ok(KeyBlockHeader::Variable {
            entry_count,
            hash_len,
        }),
        BLOCK_TYPE_FIXED_KEY_WITH_HASH | BLOCK_TYPE_FIXED_KEY_NO_HASH => {
            ensure!(block.len() >= 6, "Fixed key block header is too small");
            let key_size = block[4] as usize;
            if block[5] == FIXED_KEY_BLOCK_MIXED_VALUE_TYPE {
                ensure!(block.len() >= 7, "Mixed key block header is too small");
                Ok(KeyBlockHeader::FixedMixedType {
                    entry_count,
                    hash_len,
                    key_size,
                    stride: hash_len + key_size + block[6] as usize + 1,
                })
            } else {
                Ok(KeyBlockHeader::Fixed {
                    entry_count,
                    hash_len,
                    key_size,
                    value_type: block[5],
                })
            }
        }
        _ => unreachable!(),
    }
}

/// Returns the entry type bytes from a key block after validating its layout.
pub fn key_block_entry_types(header: KeyBlockHeader, block: &[u8]) -> Result<Vec<u8>> {
    let count = header.entry_count() as usize;
    match header {
        KeyBlockHeader::Variable { .. } => {
            let end = KEY_BLOCK_HEADER_SIZE + count * size_of::<u32>();
            let offsets = block
                .get(KEY_BLOCK_HEADER_SIZE..end)
                .context("Variable key block offset table is truncated")?;
            Ok(offsets
                .as_chunks::<4>()
                .0
                .iter()
                .map(|entry| entry[0])
                .collect())
        }
        KeyBlockHeader::Fixed {
            hash_len,
            key_size,
            value_type,
            ..
        } => {
            let stride = hash_len + key_size + entry_value_size(value_type)?;
            ensure!(
                block.len() == 6 + count * stride,
                "Fixed key block has an invalid length"
            );
            Ok(vec![value_type; count])
        }
        KeyBlockHeader::FixedMixedType {
            hash_len,
            key_size,
            stride,
            ..
        } => {
            ensure!(
                block.len() == 7 + count * stride,
                "Mixed key block has an invalid length"
            );
            Ok((0..count)
                .map(|index| block[7 + index * stride + hash_len + key_size])
                .collect())
        }
    }
}

fn entry_value_size(entry_type: u8) -> Result<usize> {
    match entry_type {
        KEY_BLOCK_ENTRY_TYPE_SMALL => Ok(SMALL_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => Ok(MEDIUM_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_BLOB => Ok(BLOB_VALUE_REF_SIZE),
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED => Ok(KEY_DELETED_REF_SIZE),
        value if value >= KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN => {
            Ok((value - KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN) as usize)
        }
        value if value >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
            Ok((value - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as usize)
        }
        value => bail!("Invalid key block entry type {value}"),
    }
}

/// Returns the maximum stored key length in a parsed key block.
pub fn max_key_length(header: KeyBlockHeader, block: &[u8]) -> Result<usize> {
    match header {
        KeyBlockHeader::Fixed { key_size, .. }
        | KeyBlockHeader::FixedMixedType { key_size, .. } => Ok(key_size),
        KeyBlockHeader::Variable {
            entry_count,
            hash_len,
        } => {
            let entry_count = entry_count as usize;
            let header_size = KEY_BLOCK_HEADER_SIZE + entry_count * size_of::<u32>();
            ensure!(
                header_size <= block.len(),
                "Variable key block header is truncated"
            );
            let offsets = &block[KEY_BLOCK_HEADER_SIZE..header_size];
            let mut max_key = 0;
            for index in 0..entry_count {
                let word = (&offsets[index * 4..]).read_u32::<BE>()?;
                let entry_type = (word >> 24) as u8;
                let start = header_size + (word & 0x00ff_ffff) as usize;
                let end = if index + 1 < entry_count {
                    let next = (&offsets[(index + 1) * 4..]).read_u32::<BE>()?;
                    header_size + (next & 0x00ff_ffff) as usize
                } else {
                    block.len()
                };
                let overhead = hash_len + entry_value_size(entry_type)?;
                ensure!(
                    end >= start + overhead && end <= block.len(),
                    "Invalid entry bounds in variable key block"
                );
                max_key = max_key.max(end - start - overhead);
            }
            Ok(max_key)
        }
    }
}

/// Opens and mmaps an SST for offline analysis.
pub fn open_sst(db_path: &Path, info: &SstInfo) -> Result<(Mmap, u64, usize)> {
    let path = db_path.join(format!("{:08}.sst", info.sequence_number));
    let file = File::open(&path).with_context(|| format!("Failed to open {}", path.display()))?;
    let file_size = file.metadata()?.len();
    let mmap = unsafe { Mmap::map(file.file()) }
        .with_context(|| format!("Failed to mmap {}", path.display()))?;
    advise_mmap_for_persistence(&mmap)?;
    let directory_size = info.block_count as usize * size_of::<u32>();
    ensure!(
        mmap.len() >= directory_size,
        "SST block directory is truncated"
    );
    let block_offsets_start = mmap.len() - directory_size;
    Ok((mmap, file_size, block_offsets_start))
}

#[cfg(test)]
mod tests {
    use byteorder::{BE, WriteBytesExt};

    use super::{max_key_length, parse_key_block_header, parse_key_block_indices};
    use crate::static_sorted_file::{
        BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY_NO_HASH, KEY_BLOCK_ENTRY_TYPE_INLINE_MIN,
    };

    #[test]
    fn parses_index_block_indices() {
        let mut block = vec![BLOCK_TYPE_INDEX];
        block.write_u16::<BE>(3).unwrap();
        block.write_u64::<BE>(42).unwrap();
        block.write_u16::<BE>(7).unwrap();
        assert_eq!(parse_key_block_indices(&block).unwrap(), [3, 7].into());
    }

    #[test]
    fn finds_maximum_variable_key_length() {
        let mut block = vec![BLOCK_TYPE_KEY_NO_HASH, 0, 0, 2];
        block
            .write_u32::<BE>((KEY_BLOCK_ENTRY_TYPE_INLINE_MIN as u32) << 24)
            .unwrap();
        block
            .write_u32::<BE>(((KEY_BLOCK_ENTRY_TYPE_INLINE_MIN as u32) << 24) | 3)
            .unwrap();
        block.extend_from_slice(b"abc");
        block.extend_from_slice(b"a-much-longer-key");
        let header = parse_key_block_header(&block).unwrap();
        assert_eq!(max_key_length(header, &block).unwrap(), 17);
    }

    #[test]
    fn rejects_truncated_variable_key_table() {
        let block = [BLOCK_TYPE_KEY_NO_HASH, 0, 0, 2, 0, 0, 0, 0];
        let header = parse_key_block_header(&block).unwrap();
        assert!(max_key_length(header, &block).is_err());
    }
}
