//! SST file inspector binary for turbo-persistence databases.
//!
//! This tool inspects SST files to report entry type statistics per family,
//! useful for verifying that inline value optimization is being used.
//!
//! Entry types are the `KEY_BLOCK_ENTRY_TYPE_*` constants in
//! [`turbo_persistence::static_sorted_file`]; the `--help` output lists them with their current
//! values. The two ranged kinds encode a size in the type byte: an inline value's byte count is
//! `type - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN`, and a key-value tombstone's deleted byte count is
//! `type - KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN`.

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use fs_err::File;
use memmap2::Mmap;
use turbo_persistence::{
    MAX_INLINE_VALUE_SIZE,
    mmap_helper::advise_mmap_for_persistence,
    offline::{
        KeyBlockHeader, SstInfo, collect_sst_info, key_block_entry_types, parse_key_block_header,
        parse_key_block_indices, read_block,
    },
    static_sorted_file::{
        KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_INLINE_MIN,
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED, KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN,
        KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_SMALL,
    },
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
    /// Key block sizes (all types combined)
    key_blocks: BlockSizeInfo,
    /// Variable-size key blocks (types 1/2)
    variable_key_blocks: BlockSizeInfo,
    /// Fixed-size key blocks (types 3/4)
    fixed_key_blocks: BlockSizeInfo,
    /// Value block sizes (small values)
    value_blocks: BlockSizeInfo,

    /// Block directory size (block_count * 4 bytes at end of file)
    block_directory_size: u64,

    /// Value sizes by type (inline values track actual bytes)
    inline_value_bytes: u64,
    small_value_refs: u64,        // Count of references to value blocks
    medium_value_refs: u64,       // Count of references to medium values
    blob_refs: u64,               // Count of blob references
    key_deleted_count: u64,       // Count of key tombstones
    key_value_deleted_count: u64, // Count of key-value tombstones

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
        self.variable_key_blocks.merge(&other.variable_key_blocks);
        self.fixed_key_blocks.merge(&other.fixed_key_blocks);
        self.value_blocks.merge(&other.value_blocks);
        self.block_directory_size += other.block_directory_size;
        self.inline_value_bytes += other.inline_value_bytes;
        self.small_value_refs += other.small_value_refs;
        self.medium_value_refs += other.medium_value_refs;
        self.blob_refs += other.blob_refs;
        self.key_deleted_count += other.key_deleted_count;
        self.key_value_deleted_count += other.key_value_deleted_count;
        self.file_size += other.file_size;
    }
}

/// Accumulates statistics for a single entry of the given type.
fn track_entry_type(stats: &mut SstStats, entry_type: u8) {
    *stats.entry_type_counts.entry(entry_type).or_insert(0) += 1;
    stats.total_entries += 1;

    match entry_type {
        KEY_BLOCK_ENTRY_TYPE_SMALL => {
            stats.small_value_refs += 1;
        }
        KEY_BLOCK_ENTRY_TYPE_BLOB => {
            stats.blob_refs += 1;
        }
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED => {
            stats.key_deleted_count += 1;
        }
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => {
            stats.medium_value_refs += 1;
        }
        // Must precede the inline arm: both are open-ended and the tombstone range sits above it.
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN => {
            stats.key_value_deleted_count += 1;
        }
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_INLINE_MIN => {
            let inline_size = (ty - KEY_BLOCK_ENTRY_TYPE_INLINE_MIN) as u64;
            stats.inline_value_bytes += inline_size;
        }
        _ => {}
    }
}

fn entry_type_description(ty: u8) -> String {
    match ty {
        KEY_BLOCK_ENTRY_TYPE_SMALL => "small value (in value block)".to_string(),
        KEY_BLOCK_ENTRY_TYPE_BLOB => "blob reference".to_string(),
        KEY_BLOCK_ENTRY_TYPE_KEY_DELETED => "key tombstone".to_string(),
        KEY_BLOCK_ENTRY_TYPE_MEDIUM => "medium value".to_string(),
        // Must precede the inline arm: both are open-ended and the tombstone range sits above it.
        ty if ty >= KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN => {
            let size = ty - KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN;
            format!("key-value tombstone ({size} byte value)")
        }
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

/// Analyze an SST file and return entry type statistics
fn analyze_sst_file(db_path: &Path, info: &SstInfo) -> Result<SstStats> {
    let compression = info.compression;
    let filename = format!("{:08}.sst", info.sequence_number);
    let path = db_path.join(&filename);

    let file = File::open(&path)?;
    let file_size = file.metadata()?.len();
    let mmap = unsafe { Mmap::map(file.file())? };
    advise_mmap_for_persistence(&mmap)?;

    let mut stats = SstStats {
        block_directory_size: info.block_count as u64 * size_of::<u32>() as u64,
        file_size,
        ..Default::default()
    };

    let block_offsets_start = mmap.len() - (info.block_count as usize * size_of::<u32>());

    // Read the index block (always the last block) first to learn which blocks are key blocks.
    // Without this, we'd have to guess block types from their first byte, which is wrong for
    // value blocks (they have no type header and their data can start with any byte).
    let index_block_index = info.block_count - 1;
    let index_raw = read_block(
        &mmap,
        block_offsets_start,
        index_block_index,
        info.sequence_number,
        compression,
    )?;
    let key_block_indices = parse_key_block_indices(&index_raw.data)?;

    stats.index_blocks.add(
        index_raw.stored_size,
        index_raw.actual_size,
        index_raw.was_compressed,
    );

    // Now iterate through all blocks, using the key block set for classification.
    for block_index in 0..index_block_index {
        let raw = match read_block(
            &mmap,
            block_offsets_start,
            block_index,
            info.sequence_number,
            compression,
        ) {
            Ok(raw) => raw,
            Err(e) => {
                eprintln!(
                    "Warning: Failed to read block {} in {:08}.sst: {}",
                    block_index, info.sequence_number, e
                );
                continue;
            }
        };

        if !key_block_indices.contains(&block_index) {
            // Value block — no type header, just raw data.
            stats
                .value_blocks
                .add(raw.stored_size, raw.actual_size, raw.was_compressed);
            continue;
        }

        let block: &[u8] = &raw.data;

        stats
            .key_blocks
            .add(raw.stored_size, raw.actual_size, raw.was_compressed);

        let key_block_header = parse_key_block_header(block).with_context(|| {
            format!(
                "Warning: key block {} in {:08}.sst has unexpected block type {}",
                block_index, info.sequence_number, block[0]
            )
        })?;
        match key_block_header {
            KeyBlockHeader::Variable { .. } => {
                stats
                    .variable_key_blocks
                    .add(raw.stored_size, raw.actual_size, raw.was_compressed);
            }
            KeyBlockHeader::Fixed { .. } | KeyBlockHeader::FixedMixedType { .. } => {
                stats
                    .fixed_key_blocks
                    .add(raw.stored_size, raw.actual_size, raw.was_compressed);
            }
        };

        for entry_type in key_block_entry_types(key_block_header, block)? {
            track_entry_type(&mut stats, entry_type);
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
    if stats.key_deleted_count > 0 {
        println!(
            "{}  Key tombstones: {} entries",
            prefix,
            format_number(stats.key_deleted_count)
        );
    }
    if stats.key_value_deleted_count > 0 {
        println!(
            "{}  Key-value tombstones: {} entries",
            prefix,
            format_number(stats.key_value_deleted_count)
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
    let overhead = stats.block_directory_size;
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
    if stats.variable_key_blocks.total_count() > 0 && stats.fixed_key_blocks.total_count() > 0 {
        print!("  │       ");
        print_block_stats("Variable", &stats.variable_key_blocks);
        print!("  │       ");
        print_block_stats("Fixed", &stats.fixed_key_blocks);
    } else if stats.fixed_key_blocks.total_count() > 0 {
        println!("  │       (all fixed-size)");
    }
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
    let total_overhead = stats.block_directory_size;
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
    if stats.variable_key_blocks.total_count() > 0 && stats.fixed_key_blocks.total_count() > 0 {
        // Only show breakdown when both types are present
        print!("      ");
        print_block_stats("Variable", &stats.variable_key_blocks);
        print!("      ");
        print_block_stats("Fixed", &stats.fixed_key_blocks);
    } else if stats.fixed_key_blocks.total_count() > 0 {
        println!("      (all fixed-size)");
    }
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
            eprintln!(
                "  {KEY_BLOCK_ENTRY_TYPE_SMALL}: Small value (stored in separate value block)"
            );
            eprintln!("  {KEY_BLOCK_ENTRY_TYPE_BLOB}: Blob reference");
            eprintln!(
                "  {KEY_BLOCK_ENTRY_TYPE_KEY_DELETED}: Key tombstone (deletes all values for the \
                 key)"
            );
            eprintln!("  {KEY_BLOCK_ENTRY_TYPE_MEDIUM}: Medium value");
            eprintln!(
                "  {KEY_BLOCK_ENTRY_TYPE_INLINE_MIN}-{}: Inline value (size = type - \
                 {KEY_BLOCK_ENTRY_TYPE_INLINE_MIN})",
                KEY_BLOCK_ENTRY_TYPE_INLINE_MIN + MAX_INLINE_VALUE_SIZE as u8
            );
            eprintln!(
                "  {KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN}-{}: Key-value tombstone (deleted \
                 value size = type - {KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN})",
                KEY_BLOCK_ENTRY_TYPE_KEY_VALUE_DELETED_MIN + MAX_INLINE_VALUE_SIZE as u8
            );
            eprintln!();
            eprintln!("For TaskCache (family 3), values are 4-byte TaskIds.");
            eprintln!(
                "Expected entry type is {} ({KEY_BLOCK_ENTRY_TYPE_INLINE_MIN} + 4) for inline \
                 optimization.",
                KEY_BLOCK_ENTRY_TYPE_INLINE_MIN + 4
            );
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

    // Analyze and report by family.
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
