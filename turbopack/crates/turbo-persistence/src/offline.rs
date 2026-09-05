//! Shared helpers for offline inspection of persistence databases.

use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
    sync::Arc,
};

use anyhow::{Context, Result, bail, ensure};
use byteorder::{BE, ReadBytesExt};
use fs_err as fs;

use crate::{
    Compression, checksum_block, compression::decompress_into_arc, meta_file::MetaFile,
    read_current_version, sst_filter::SstFilter,
};

/// Information about an active SST recorded by a meta file.
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
        if path.extension().and_then(|extension| extension.to_str()) == Some("del") {
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
            if path.extension().and_then(|extension| extension.to_str()) != Some("meta") {
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

/// Verifies and reconstructs a raw medium-value block from an SST iterator.
pub fn decode_medium(
    compression: Compression,
    uncompressed_length: u32,
    expected_checksum: u32,
    stored: &[u8],
) -> Result<Arc<[u8]>> {
    verify_checksum(stored, expected_checksum, "medium value")?;
    if uncompressed_length > 0 {
        decompress_into_arc(compression, uncompressed_length, stored)
            .context("Failed to decompress medium value")
    } else {
        Ok(Arc::from(stored))
    }
}

/// Reads, verifies, and decompresses one blob file.
pub fn read_blob(
    db_path: &Path,
    sequence_number: u32,
    compression: Compression,
) -> Result<Arc<[u8]>> {
    let path = db_path.join(format!("{sequence_number:08}.blob"));
    let content = fs::read(&path).with_context(|| format!("Failed to read {}", path.display()))?;
    ensure!(
        content.len() >= 8,
        "Blob file {} is truncated",
        path.display()
    );
    let mut reader: &[u8] = &content;
    let uncompressed_length = reader.read_u32::<BE>()?;
    let expected_checksum = reader.read_u32::<BE>()?;
    verify_checksum(
        reader,
        expected_checksum,
        &format!("blob file {}", path.display()),
    )?;
    ensure!(
        uncompressed_length > 0,
        "Blob file {} has an invalid uncompressed length of zero",
        path.display()
    );
    decompress_into_arc(compression, uncompressed_length, reader)
        .with_context(|| format!("Failed to decompress {}", path.display()))
}

fn verify_checksum(data: &[u8], expected: u32, description: &str) -> Result<()> {
    let actual = checksum_block(data);
    ensure!(
        actual == expected,
        "Checksum mismatch in {description} (expected {expected:08x}, got {actual:08x})"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use byteorder::{BE, WriteBytesExt};

    use super::{decode_medium, read_blob};
    use crate::{Compression, checksum_block, compression::Compressor};

    #[test]
    fn decodes_compressed_and_uncompressed_medium_values() -> anyhow::Result<()> {
        let value = b"function component() { return null; }".repeat(100);
        let mut compressed = Vec::new();
        Compressor::new(Compression::Zstd3)?.compress_into_buffer(&value, &mut compressed)?;
        let decoded = decode_medium(
            Compression::Zstd3,
            value.len() as u32,
            checksum_block(&compressed),
            &compressed,
        )?;
        assert_eq!(decoded.as_ref(), value);

        let decoded = decode_medium(Compression::Zstd3, 0, checksum_block(&value), &value)?;
        assert_eq!(decoded.as_ref(), value);
        Ok(())
    }

    #[test]
    fn reads_blob_and_rejects_bad_checksum() -> anyhow::Result<()> {
        let directory = tempfile::tempdir()?;
        let value = b"blob data".repeat(100);
        let compressed = zstd::bulk::compress(&value, 3)?;
        let mut file = Vec::new();
        file.write_u32::<BE>(value.len() as u32)?;
        file.write_u32::<BE>(checksum_block(&compressed))?;
        file.extend_from_slice(&compressed);
        fs_err::write(directory.path().join("00000001.blob"), &file)?;
        assert_eq!(
            read_blob(directory.path(), 1, Compression::Zstd3)?.as_ref(),
            value
        );

        file[4] ^= 1;
        fs_err::write(directory.path().join("00000001.blob"), file)?;
        assert!(read_blob(directory.path(), 1, Compression::Zstd3).is_err());
        Ok(())
    }
}
