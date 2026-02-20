//! SST file inspector binary for turbo-persistence databases.
//!
//! This tool inspects SST files to report entry type statistics per family,
//! useful for verifying that inline value optimization is being used.
//!
//! Entry types:
//! - 0: Small value (stored in value block)
//! - 1: Blob reference
//! - 2: Deleted/tombstone
//! - 3: Medium value
//! - 8-255: Inline value where (type - 8) = value byte count

use std::{
    collections::BTreeMap,
    fs::{self, File},
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt};
use lzzzz::lz4::{decompress, decompress_with_dict};
use memmap2::Mmap;
use turbo_persistence::meta_file::MetaFile;
// Import shared constants from the crate
use turbo_persistence::static_sorted_file::{
    BLOCK_TYPE_INDEX, BLOCK_TYPE_KEY_NO_HASH, BLOCK_TYPE_KEY_WITH_HASH, KEY_BLOCK_ENTRY_TYPE_BLOB,
    KEY_BLOCK_ENTRY_TYPE_DELETED, KEY_BLOCK_ENTRY_TYPE_INLINE_MIN, KEY_BLOCK_ENTRY_TYPE_MEDIUM,
    KEY_BLOCK_ENTRY_TYPE_SMALL,
};

/// Block size information
#[derive(Default, Debug, Clone)]
struct BlockSizeInfo {
    /// Size as stored on disk (after compression, if any)
    stored_size: u64,
    /// Actual size (after decompression)
    actual_size: u64,
    /// Number of blocks that were compressed
    compressed_count: u64,
    /// Number of blocks stored uncompressed
    uncompressed_count: u64,
}

impl BlockSizeInfo {
    fn add(&mut self, stored: u64, actual: u64, was_compressed: bool) {
        self.stored_size += stored;
        self.actual_size += actual;
        if was_compressed {
            self.compressed_count += 1;
        } else {
            self.uncompressed_count += 1;
        }
    }

    fn total_count(&self) -> u64 {
        self.compressed_count + self.uncompressed_count
    }

    fn merge(&mut self, other: &BlockSizeInfo) {
        self.stored_size += other.stored_size;
        self.actual_size += other.actual_size;
        self.compressed_count += other.compressed_count;
        self.uncompressed_count += other.uncompressed_count;
    }
}

/// Statistics for a single SST file
#[derive(Default, Debug, Clone)]
struct SstStats {
    /// Count of entries by type
    entry_type_counts: BTreeMap<u8, u64>,
    /// Total entries
    total_entries: u64,

    /// Index block sizes
    index_blocks: BlockSizeInfo,
    /// Key block sizes
    key_blocks: BlockSizeInfo,
    /// Value block sizes (small values)
    value_blocks: BlockSizeInfo,

    /// Key compression dictionary size
    key_dict_size: u64,
    /// Block directory size (block_count * 4 bytes at end of file)
    block_directory_size: u64,

    /// Value sizes by type (inline values track actual bytes)
    inline_value_bytes: u64,
    small_value_refs: u64,  // Count of references to value blocks
    medium_value_refs: u64, // Count of references to medium values
    blob_refs: u64,         // Count of blob references
    deleted_count: u64,     // Count of deleted entries

    /// File size in bytes
    file_size: u64,
}

impl SstStats {
    fn merge(&mut self, other: &SstStats) {
        for (ty, count) in &other.entry_type_counts {
            *self.entry_type_counts.entry(*ty).or_insert(0) += count;
        }
        self.total_entries += other.total_entries;
        self.index_blocks.merge(&other.index_blocks);
        self.key_blocks.merge(&other.key_blocks);
        self.value_blocks.merge(&other.value_blocks);
        self.key_dict_size += other.key_dict_size;
        self.block_directory_size += other.block_directory_size;
        self.inline_value_bytes += other.inline_value_bytes;
        self.small_value_refs += other.small_value_refs;
        self.medium_value_refs += other.medium_value_refs;
        self.blob_refs += other.blob_refs;
        self.deleted_count += other.deleted_count;
        self.file_size += other.file_size;
    }
}

/// Information about an SST file from the meta file
struct SstInfo {
    sequence_number: u32,
    key_compression_dictionary_length: u16,
    block_count: u16,
}

fn entry_type_description(ty: u8) -> String {
    match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => "small value (in value block)".to_string(),
        KEY_BLOCK_ENTRY_TYPE_BLOB => "blob reference".to_string(),
        KEY_BLOCK_ENTRY_TYPE_DELETED => "deleted/tombstone".to_string(),
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => "medium value".to_string(),
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
            let inline_size = ty - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN;
            format!("inline {} bytes", inline_size)
        }
        _ => format!("unknown type {}", ty),
    }
}

fn family_name(family: u32) -> &'static str {
    match family {
        0 => "Infra",
        1 => "TaskMeta",
        2 => "TaskData",
        3 => "TaskCache",
        _ => "Unknown",
    }
}

/// Format a number with comma separators for readability
fn format_number(n: u64) -> String {
    let s = n.to_string();
    let mut result = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            result.push(',');
        }
        result.push(c);
    }
    result
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.2} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

/// Collect SST info from all meta files in the database directory
fn collect_sst_info(db_path: &Path) -> Result<BTreeMap<u32, Vec<SstInfo>>> {
    let mut meta_files: Vec<PathBuf> = fs::read_dir(db_path)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "meta"))
        .collect();

    meta_files.sort();

    if meta_files.is_empty() {
        bail!("No .meta files found in {}", db_path.display());
    }

    let mut family_sst_info: BTreeMap<u32, Vec<SstInfo>> = BTreeMap::new();

    for meta_path in &meta_files {
        // Extract sequence number from filename
        let filename = meta_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let seq_num: u32 = filename.parse().unwrap_or(0);

        let meta_file = MetaFile::open(db_path, seq_num)
            .with_context(|| format!("Failed to open {}", meta_path.display()))?;

        let family = meta_file.family();

        for entry in meta_file.entries() {
            family_sst_info.entry(family).or_default().push(SstInfo {
                sequence_number: entry.sequence_number(),
                key_compression_dictionary_length: entry.key_compression_dictionary_length(),
                block_count: entry.block_count(),
            });
        }
    }

    Ok(family_sst_info)
}

/// Decompress a block, respecting the optional compression protocol.
/// When uncompressed_length is 0, the block is stored uncompressed.
fn decompress_block(
    compressed: &[u8],
    uncompressed_length: u32,
    dictionary: Option<&[u8]>,
) -> Result<Arc<[u8]>> {
    // Sentinel: uncompressed_length = 0 means block is stored uncompressed
    if uncompressed_length == 0 {
        return Ok(Arc::from(compressed));
    }

    let mut buffer = vec![0u8; uncompressed_length as usize];
    let bytes_written = if let Some(dict) = dictionary {
        decompress_with_dict(compressed, &mut buffer, dict)?
    } else {
        decompress(compressed, &mut buffer)?
    };
    assert_eq!(
        bytes_written, uncompressed_length as usize,
        "Decompressed length does not match expected"
    );
    Ok(Arc::from(buffer))
}

/// Analyze an SST file and return entry type statistics
fn analyze_sst_file(db_path: &Path, info: &SstInfo) -> Result<SstStats> {
    let filename = format!("{:08}.sst", info.sequence_number);
    let path = db_path.join(&filename);

    let file = File::open(&path).with_context(|| format!("Failed to open {}", filename))?;
    let file_size = file.metadata()?.len();
    let mmap = unsafe { Mmap::map(&file)? };

    let mut stats = SstStats {
        key_dict_size: info.key_compression_dictionary_length as u64,
        block_directory_size: info.block_count as u64 * 4,
        file_size,
        ..Default::default()
    };

    // Calculate offsets
    let block_offsets_start = mmap.len() - (info.block_count as usize * 4);
    let blocks_start = info.key_compression_dictionary_length as usize;

    // Get key compression dictionary if present
    let key_dict = if info.key_compression_dictionary_length > 0 {
        Some(&mmap[0..info.key_compression_dictionary_length as usize])
    } else {
        None
    };

    // Iterate through all blocks
    for block_index in 0..info.block_count {
        let offset = block_offsets_start + block_index as usize * 4;

        let block_start = if block_index == 0 {
            blocks_start
        } else {
            blocks_start + (&mmap[offset - 4..offset]).read_u32::<BE>()? as usize
        };
        let block_end = blocks_start + (&mmap[offset..offset + 4]).read_u32::<BE>()? as usize;

        // Read uncompressed length and compressed data
        let uncompressed_length = (&mmap[block_start..block_start + 4]).read_u32::<BE>()?;
        let compressed_data = &mmap[block_start + 4..block_end];
        let compressed_size = compressed_data.len() as u64;

        // Determine if block was compressed (uncompressed_length > 0 means it was compressed)
        let was_compressed = uncompressed_length > 0;
        // Actual size: if uncompressed_length is 0, use stored size (block wasn't compressed)
        let actual_size = if uncompressed_length == 0 {
            compressed_size
        } else {
            uncompressed_length as u64
        };

        // Try to decompress with key dictionary first (for key/index blocks)
        let decompressed = match decompress_block(compressed_data, uncompressed_length, key_dict) {
            Ok(data) => data,
            Err(_) => {
                // If that fails, try without dictionary (value blocks)
                match decompress_block(compressed_data, uncompressed_length, None) {
                    Ok(_) => {
                        // This is a value block
                        stats
                            .value_blocks
                            .add(compressed_size, actual_size, was_compressed);
                        continue; // Value blocks don't have entry type headers
                    }
                    Err(e) => {
                        eprintln!(
                            "Warning: Failed to decompress block {} in {:08}.sst: {}",
                            block_index, info.sequence_number, e
                        );
                        continue;
                    }
                }
            }
        };

        let block = &decompressed[..];
        if block.is_empty() {
            continue;
        }

        let block_type = block[0];

        // The index block is always the LAST block in the file
        let is_last_block = block_index == info.block_count - 1;

        match block_type {
            BLOCK_TYPE_INDEX if is_last_block => {
                // Validate index block structure: 1 byte type + 2 byte first_block + N*(10 bytes)
                let content_len = block.len() - 3; // subtract header
                if content_len % 10 == 0 {
                    stats
                        .index_blocks
                        .add(compressed_size, actual_size, was_compressed);
                } else {
                    // Invalid structure, treat as value block
                    stats
                        .value_blocks
                        .add(compressed_size, actual_size, was_compressed);
                }
            }
            BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => {
                // Key block - extract entry types
                if block.len() < 4 {
                    // Too small to be a valid key block, likely garbage from wrong decompression
                    stats
                        .value_blocks
                        .add(compressed_size, actual_size, was_compressed);
                    continue;
                }

                // Entry count is stored as 3 bytes after the block type
                let entry_count =
                    ((block[1] as u32) << 16) | ((block[2] as u32) << 8) | (block[3] as u32);

                // Validate entry count - if it's unreasonably large or the block is too small
                // to contain the headers, this is likely garbage from wrong decompression
                let expected_header_size = 4 + entry_count as usize * 4;
                if entry_count == 0 || entry_count > 100_000 || expected_header_size > block.len() {
                    // Invalid key block structure, treat as value block
                    stats
                        .value_blocks
                        .add(compressed_size, actual_size, was_compressed);
                    continue;
                }

                stats
                    .key_blocks
                    .add(compressed_size, actual_size, was_compressed);

                // Entry headers start at offset 4
                // Each entry header is 4 bytes: 1 byte type + 3 bytes position
                for i in 0..entry_count as usize {
                    let header_offset = 4 + i * 4;
                    if header_offset >= block.len() {
                        break;
                    }
                    let entry_type = block[header_offset];

                    *stats.entry_type_counts.entry(entry_type).or_insert(0) += 1;
                    stats.total_entries += 1;

                    // Track value statistics
                    match entry_type {
                        KEY_BLOCK_ENTRY_TYPE_SMALL => {
                            stats.small_value_refs += 1;
                        }
                        KEY_BLOCK_ENTRY_TYPE_BLOB => {
                            stats.blob_refs += 1;
                        }
                        KEY_BLOCK_ENTRY_TYPE_DELETED => {
                            stats.deleted_count += 1;
                        }
                        KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
                            stats.medium_value_refs += 1;
                        }
                        ty if ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
                            let inline_size = (ty - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as u64;
                            stats.inline_value_bytes += inline_size;
                        }
                        _ => {}
                    }
                }
            }
            _ => {
                // Unknown block type - might be a value block that happened to decompress with dict
                // Try to identify it as a value block
                stats
                    .value_blocks
                    .add(compressed_size, actual_size, was_compressed);
            }
        }
    }

    Ok(stats)
}

fn print_block_stats(name: &str, info: &BlockSizeInfo) {
    let total = info.total_count();
    if total == 0 {
        println!("    {}: none", name);
        return;
    }

    // Determine compression status
    let all_uncompressed = info.compressed_count == 0;
    let all_compressed = info.uncompressed_count == 0;

    if all_uncompressed {
        // All blocks uncompressed - just show size
        println!(
            "    {}: {} blocks (uncompressed), {}",
            name,
            format_number(total),
            format_bytes(info.actual_size),
        );
    } else if all_compressed {
        // All blocks compressed - show stored vs actual with savings
        let savings_pct = if info.actual_size > 0 {
            ((info.actual_size as f64 - info.stored_size as f64) / info.actual_size as f64) * 100.0
        } else {
            0.0
        };
        let savings_str = if savings_pct < 0.0 {
            format!("{:.0}% overhead", -savings_pct)
        } else {
            format!("{:.0}% savings", savings_pct)
        };
        println!(
            "    {}: {} blocks, stored: {}, actual: {} ({})",
            name,
            format_number(total),
            format_bytes(info.stored_size),
            format_bytes(info.actual_size),
            savings_str,
        );
    } else {
        // Mixed - show breakdown
        let savings_pct = if info.actual_size > 0 {
            ((info.actual_size as f64 - info.stored_size as f64) / info.actual_size as f64) * 100.0
        } else {
            0.0
        };
        let savings_str = if savings_pct < 0.0 {
            format!("{:.0}% overhead", -savings_pct)
        } else {
            format!("{:.0}% savings", savings_pct)
        };
        println!(
            "    {}: {} blocks ({} compressed, {} uncompressed)",
            name,
            format_number(total),
            format_number(info.compressed_count),
            format_number(info.uncompressed_count),
        );
        println!(
            "          stored: {}, actual: {} ({})",
            format_bytes(info.stored_size),
            format_bytes(info.actual_size),
            savings_str,
        );
    }
}

fn print_entry_histogram(stats: &SstStats, prefix: &str) {
    if stats.entry_type_counts.is_empty() {
        return;
    }
    println!("{}Entry Type Histogram:", prefix);
    for (ty, count) in &stats.entry_type_counts {
        let pct = (*count as f64 / stats.total_entries as f64) * 100.0;
        // Visual bar
        let bar_len = (pct / 2.0) as usize;
        let bar: String = "█".repeat(bar_len.min(40));
        println!(
            "{}  type {:3}: {:>12} ({:5.1}%) │{}│ {}",
            prefix,
            ty,
            format_number(*count),
            pct,
            bar,
            entry_type_description(*ty),
        );
    }
}

fn print_value_storage(stats: &SstStats, prefix: &str) {
    println!("{}Value Storage:", prefix);
    if stats.inline_value_bytes > 0 {
        let inline_count: u64 = stats
            .entry_type_counts
            .iter()
            .filter(|(ty, _)| **ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN)
            .map(|(_, count)| count)
            .sum();
        println!(
            "{}  Inline: {} entries, {} total",
            prefix,
            format_number(inline_count),
            format_bytes(stats.inline_value_bytes)
        );
    }
    if stats.small_value_refs > 0 {
        println!(
            "{}  Small (value block refs): {} entries",
            prefix,
            format_number(stats.small_value_refs)
        );
    }
    if stats.medium_value_refs > 0 {
        println!(
            "{}  Medium (dedicated blocks): {} entries",
            prefix,
            format_number(stats.medium_value_refs)
        );
    }
    if stats.blob_refs > 0 {
        println!(
            "{}  Blob (external files): {} entries",
            prefix,
            format_number(stats.blob_refs)
        );
    }
    if stats.deleted_count > 0 {
        println!(
            "{}  Deleted: {} entries",
            prefix,
            format_number(stats.deleted_count)
        );
    }
}

fn print_sst_details(seq_num: u32, stats: &SstStats) {
    println!(
        "\n  ┌─ SST {:08}.sst ─────────────────────────────────────────────────────",
        seq_num
    );
    println!(
        "  │ Entries: {}, File size: {}",
        format_number(stats.total_entries),
        format_bytes(stats.file_size)
    );

    // Per-file overhead
    let overhead = stats.key_dict_size + stats.block_directory_size;
    let overhead_pct = if stats.file_size > 0 {
        (overhead as f64 / stats.file_size as f64) * 100.0
    } else {
        0.0
    };
    println!("  │");
    println!(
        "  │ Per-file Overhead: {} ({:.1}% of file)",
        format_bytes(overhead),
        overhead_pct
    );
    println!(
        "  │   Key compression dictionary: {}",
        format_bytes(stats.key_dict_size)
    );
    println!(
        "  │   Block directory: {}",
        format_bytes(stats.block_directory_size)
    );

    // Block statistics
    println!("  │");
    println!("  │ Block Statistics:");
    print!("  │   ");
    print_block_stats("Index blocks", &stats.index_blocks);
    print!("  │   ");
    print_block_stats("Key blocks", &stats.key_blocks);
    print!("  │   ");
    print_block_stats("Value blocks", &stats.value_blocks);

    // Entry type histogram
    if !stats.entry_type_counts.is_empty() {
        println!("  │");
        print_entry_histogram(stats, "  │ ");
    }

    // Value storage summary
    println!("  │");
    print_value_storage(stats, "  │ ");

    println!("  └───────────────────────────────────────────────────────────────────────────");
}

fn print_family_summary(family: u32, sst_count: usize, stats: &SstStats) {
    println!("═══════════════════════════════════════════════════════════════════════════════");
    println!("Family {} ({}):", family, family_name(family));
    println!("═══════════════════════════════════════════════════════════════════════════════");

    println!(
        "  SST files: {}, Total entries: {}",
        format_number(sst_count as u64),
        format_number(stats.total_entries)
    );
    println!("  Total file size: {}", format_bytes(stats.file_size));

    // Averages
    if sst_count > 0 {
        let avg_file_size = stats.file_size / sst_count as u64;
        let avg_keys_per_file = stats.total_entries / sst_count as u64;
        let total_key_blocks = stats.key_blocks.total_count();
        let avg_keys_per_block = if total_key_blocks > 0 {
            stats.total_entries as f64 / total_key_blocks as f64
        } else {
            0.0
        };

        println!();
        println!("  Averages:");
        println!("    File size: {}", format_bytes(avg_file_size));
        println!("    Keys per file: {}", format_number(avg_keys_per_file));
        println!("    Keys per key block: {:.1}", avg_keys_per_block);
    }

    // Per-file overhead
    let total_overhead = stats.key_dict_size + stats.block_directory_size;
    let overhead_pct = if stats.file_size > 0 {
        (total_overhead as f64 / stats.file_size as f64) * 100.0
    } else {
        0.0
    };
    println!();
    println!(
        "  Per-file Overhead (total): {} ({:.1}% of total file size)",
        format_bytes(total_overhead),
        overhead_pct
    );
    println!(
        "    Key compression dictionaries: {}",
        format_bytes(stats.key_dict_size)
    );
    if sst_count > 0 {
        println!(
            "      Average per file: {}",
            format_bytes(stats.key_dict_size / sst_count as u64)
        );
    }
    println!(
        "    Block directories: {}",
        format_bytes(stats.block_directory_size)
    );
    if sst_count > 0 {
        println!(
            "      Average per file: {}",
            format_bytes(stats.block_directory_size / sst_count as u64)
        );
    }

    println!();
    println!("  Block Statistics:");
    print!("  ");
    print_block_stats("Index blocks", &stats.index_blocks);
    print!("  ");
    print_block_stats("Key blocks", &stats.key_blocks);
    print!("  ");
    print_block_stats("Value blocks", &stats.value_blocks);

    println!();
    print_entry_histogram(stats, "  ");

    println!();
    print_value_storage(stats, "  ");

    println!();
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();

    // Parse arguments
    let mut db_path: Option<PathBuf> = None;
    let mut verbose = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--verbose" | "-v" => verbose = true,
            arg if !arg.starts_with('-') => {
                if db_path.is_none() {
                    db_path = Some(PathBuf::from(arg));
                }
            }
            _ => {
                eprintln!("Unknown option: {}", args[i]);
                std::process::exit(1);
            }
        }
        i += 1;
    }

    let db_path = match db_path {
        Some(p) => p,
        None => {
            eprintln!("Usage: {} [OPTIONS] <db_directory>", args[0]);
            eprintln!();
            eprintln!("Inspects turbo-persistence SST files to report entry type statistics.");
            eprintln!();
            eprintln!("Options:");
            eprintln!("  -v, --verbose    Show per-SST file details (default: family totals only)");
            eprintln!();
            eprintln!("Entry types:");
            eprintln!("  0: Small value (stored in separate value block)");
            eprintln!("  1: Blob reference");
            eprintln!("  2: Deleted/tombstone");
            eprintln!("  3: Medium value");
            eprintln!("  8+: Inline value (size = type - 8)");
            eprintln!();
            eprintln!("For TaskCache (family 3), values are 4-byte TaskIds.");
            eprintln!("Expected entry type is 12 (8 + 4) for inline optimization.");
            std::process::exit(1);
        }
    };

    if !db_path.is_dir() {
        bail!("Not a directory: {}", db_path.display());
    }

    // Collect SST info grouped by family
    let family_sst_info = collect_sst_info(&db_path)?;

    let total_sst_count: usize = family_sst_info.values().map(|v| v.len()).sum();
    println!(
        "Analyzing {} SST files in {}\n",
        format_number(total_sst_count as u64),
        db_path.display()
    );

    // Analyze and report by family
    for (family, sst_list) in &family_sst_info {
        let mut family_stats = SstStats::default();
        let mut sst_stats_list: Vec<(u32, SstStats)> = Vec::new();

        for info in sst_list {
            match analyze_sst_file(&db_path, info) {
                Ok(stats) => {
                    family_stats.merge(&stats);
                    if verbose {
                        sst_stats_list.push((info.sequence_number, stats));
                    }
                }
                Err(e) => {
                    eprintln!(
                        "Warning: Failed to analyze {:08}.sst: {}",
                        info.sequence_number, e
                    );
                }
            }
        }

        // Print family summary
        print_family_summary(*family, sst_list.len(), &family_stats);

        // Print per-SST details in verbose mode
        if verbose && !sst_stats_list.is_empty() {
            println!("  Per-SST Details:");
            for (seq_num, stats) in &sst_stats_list {
                print_sst_details(*seq_num, stats);
            }
            println!();
        }
    }

    Ok(())
}
