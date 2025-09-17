#![feature(iter_intersperse)]

use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use turbo_persistence::{MetaFileEntryInfo, SerialScheduler, TurboPersistence};

fn main() -> Result<()> {
    // Get CLI argument
    let path = PathBuf::from(
        std::env::args()
            .nth(1)
            .context("Please provide a path to the TurboPersistence directory")?,
    );
    if !path.exists() {
        bail!("The provided path does not exist: {}", path.display());
    }

    let db: TurboPersistence<SerialScheduler> = TurboPersistence::open_read_only(path)?;
    let meta_info = db
        .meta_info()
        .context("Failed to retrieve meta information")?;
    for meta_file in meta_info {
        println!(
            "META {:08}.meta: family = {}, sst_size = {} MiB",
            meta_file.sequence_number,
            meta_file.family,
            meta_file.entries.iter().map(|e| e.sst_size).sum::<u64>() / 1024 / 1024,
        );
        for MetaFileEntryInfo {
            sequence_number,
            min_hash,
            max_hash,
            amqf_size,
            amqf_entries,
            sst_size,
            key_compression_dictionary_size,
            block_count,
        } in meta_file.entries
        {
            println!(
                "  SST {sequence_number:08}.sst: {min_hash:016x} - {max_hash:016x} (p = 1/{})",
                u64::MAX / (max_hash - min_hash + 1)
            );
            println!("    AMQF {amqf_entries} entries = {} KiB", amqf_size / 1024);
            println!(
                "    {} KiB = {} kiB key compression dict + {block_count} blocks (avg {} \
                 bytes/block)",
                sst_size / 1024,
                key_compression_dictionary_size / 1024,
                (sst_size - key_compression_dictionary_size as u64) / block_count as u64
            );
        }
        if !meta_file.obsolete_sst_files.is_empty() {
            println!(
                "  OBSOLETE SSTs {}",
                meta_file
                    .obsolete_sst_files
                    .iter()
                    .map(|seq| format!("{seq:08}.sst"))
                    .intersperse(", ".to_string())
                    .collect::<String>()
            );
        }
    }
    Ok(())
}
