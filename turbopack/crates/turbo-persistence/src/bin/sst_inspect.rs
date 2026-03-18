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
    collections::{BTreeMap, HashSet},
    fs::{self, File},
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt};
use lzzzz::lz4::decompress;
use memmap2::Mmap;
use turbo_persistence::{
    BLOCK_HEADER_SIZE, checksum_block,
    meta_file::MetaFile,
    mmap_helper::advise_mmap_for_persistence,
    static_sorted_file::{
        BLOCK_TYPE_FIXED_KEY_NO_HASH, BLOCK_TYPE_FIXED_KEY_WITH_HASH, BLOCK_TYPE_KEY_NO_HASH,
        BLOCK_TYPE_KEY_WITH_HASH, KEY_BLOCK_ENTRY_TYPE_BLOB, KEY_BLOCK_ENTRY_TYPE_DELETED,
        KEY_BLOCK_ENTRY_TYPE_INLINE_MIN, KEY_BLOCK_ENTRY_TYPE_MEDIUM, KEY_BLOCK_ENTRY_TYPE_SMALL,
    },
};

/// Size of the key block header (1B type + 3B entry count).
const KEY_BLOCK_HEADER_SIZE: usize = 4;

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
        self.variable_key_blocks.merge(&other.variable_key_blocks);
        self.fixed_key_blocks.merge(&other.fixed_key_blocks);
        self.value_blocks.merge(&other.value_blocks);
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
    block_count: u16,
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
                block_count: entry.block_count(),
            });
        }
    }

    Ok(family_sst_info)
}

/// Information about a raw block read from disk.
struct RawBlock {
    data: Box<[u8]>,
    compressed_size: u64,
    actual_size: u64,
    was_compressed: bool,
}

/// Reads, checksums, and decompresses a single block from the mmap.
fn read_block(
    mmap: &Mmap,
    block_offsets_start: usize,
    block_index: u16,
    sequence_number: u32,
) -> Result<RawBlock> {
    let offset = block_offsets_start + block_index as usize * size_of::<u32>();

    let block_start = if block_index == 0 {
        0
    } else {
        (&mmap[offset - size_of::<u32>()..offset]).read_u32::<BE>()? as usize
    };
    let block_end = (&mmap[offset..offset + size_of::<u32>()]).read_u32::<BE>()? as usize;

    let uncompressed_length =
        (&mmap[block_start..block_start + size_of::<u32>()]).read_u32::<BE>()?;
    let expected_checksum = (&mmap
        [block_start + size_of::<u32>()..block_start + BLOCK_HEADER_SIZE])
        .read_u32::<BE>()?;
    let compressed_data = &mmap[block_start + BLOCK_HEADER_SIZE..block_end];
    let compressed_size = compressed_data.len() as u64;

    let was_compressed = uncompressed_length > 0;
    let actual_size = if was_compressed {
        uncompressed_length as u64
    } else {
        compressed_size
    };

    let actual_checksum = checksum_block(compressed_data);
    if actual_checksum != expected_checksum {
        bail!(
            "Cache corruption detected: checksum mismatch in block {} of {:08}.sst (expected \
             {:08x}, got {:08x})",
            block_index,
            sequence_number,
            expected_checksum,
            actual_checksum
        );
    }

    let data = if was_compressed {
        let mut buffer = vec![0u8; uncompressed_length as usize];
        let bytes_written = decompress(compressed_data, &mut buffer)?;
        assert_eq!(
            bytes_written, uncompressed_length as usize,
            "Decompressed length does not match expected"
        );
        buffer.into_boxed_slice()
    } else {
        Box::from(compressed_data)
    };

    Ok(RawBlock {
        data,
        compressed_size,
        actual_size,
        was_compressed,
    })
}

/// Parses an index block to extract all referenced key block indices.
///
/// Index block format: `[1B type][2B first_block][N * (8B hash + 2B block_index)]`.
fn parse_key_block_indices(index_block: &[u8]) -> HashSet<u16> {
    assert!(index_block.len() >= 4, "Index block too small");
    let mut data = &index_block[1..]; // skip block type byte
    let first_block = data.read_u16::<BE>().unwrap();
    let mut indices = HashSet::new();
    indices.insert(first_block);
    const ENTRY_SIZE: usize = size_of::<u64>() + size_of::<u16>();
    let entry_count = data.len() / ENTRY_SIZE;
    for i in 0..entry_count {
        let block_index = (&data[i * ENTRY_SIZE + 8..]).read_u16::<BE>().unwrap();
        indices.insert(block_index);
    }
    indices
}

/// Parsed header of a key block.
enum KeyBlockHeader {
    Variable { entry_count: u32 },
    Fixed { entry_count: u32, value_type: u8 },
}

/// Parses the header of a key block from the full decompressed block data.
fn parse_key_block_header(block: &[u8]) -> Result<KeyBlockHeader> {
    assert!(block.len() >= 4, "Key block too small");
    let block_type = block[0];
    let entry_count = ((block[1] as u32) << 16) | ((block[2] as u32) << 8) | (block[3] as u32);
    match block_type {
        BLOCK_TYPE_KEY_WITH_HASH | BLOCK_TYPE_KEY_NO_HASH => {
            Ok(KeyBlockHeader::Variable { entry_count })
        }
        BLOCK_TYPE_FIXED_KEY_WITH_HASH | BLOCK_TYPE_FIXED_KEY_NO_HASH => {
            assert!(block.len() >= 6, "Fixed key block header too small");
            Ok(KeyBlockHeader::Fixed {
                entry_count,
                value_type: block[5],
            })
        }
        _ => bail!("Invalid key block type: {block_type}"),
    }
}

/// Iterates over entry type bytes in a key block.
///
/// For variable-size key blocks, reads byte 0 of each 4-byte offset table entry.
/// For fixed-size key blocks, yields the single `value_type` repeated `entry_count` times.
fn iter_key_block_entry_types(
    header: KeyBlockHeader,
    block: &[u8],
) -> impl Iterator<Item = u8> + '_ {
    let (entry_count, fixed_type) = match header {
        KeyBlockHeader::Variable { entry_count } => (entry_count, None),
        KeyBlockHeader::Fixed {
            entry_count,
            value_type,
        } => (entry_count, Some(value_type)),
    };
    (0..entry_count).map(move |i| {
        if let Some(vt) = fixed_type {
            vt
        } else {
            // Variable block: offset table starts at byte 4 (after 1B type + 3B count),
            // each entry is 4 bytes, first byte is the entry type.
            let header_offset = KEY_BLOCK_HEADER_SIZE + i as usize * 4;
            block[header_offset]
        }
    })
}

/// Analyze an SST file and return entry type statistics
fn analyze_sst_file(db_path: &Path, info: &SstInfo) -> Result<SstStats> {
    let filename = format!("{:08}.sst", info.sequence_number);
    let path = db_path.join(&filename);

    let file = File::open(&path).with_context(|| format!("Failed to open {}", filename))?;
    let file_size = file.metadata()?.len();
    let mmap = unsafe { Mmap::map(&file)? };
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
    )?;
    let key_block_indices = parse_key_block_indices(&index_raw.data);

    stats.index_blocks.add(
        index_raw.compressed_size,
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
                .add(raw.compressed_size, raw.actual_size, raw.was_compressed);
            continue;
        }

        let block: &[u8] = &raw.data;

        stats
            .key_blocks
            .add(raw.compressed_size, raw.actual_size, raw.was_compressed);

        let key_block_header = parse_key_block_header(block).with_context(|| {
            format!(
                "Warning: key block {} in {:08}.sst has unexpected block type {}",
                block_index, info.sequence_number, block[0]
            )
        })?;
        match key_block_header {
            KeyBlockHeader::Variable { .. } => {
                stats.variable_key_blocks.add(
                    raw.compressed_size,
                    raw.actual_size,
                    raw.was_compressed,
                );
            }
            KeyBlockHeader::Fixed { .. } => {
                stats.fixed_key_blocks.add(
                    raw.compressed_size,
                    raw.actual_size,
                    raw.was_compressed,
                );
            }
        };

        for entry_type in iter_key_block_entry_types(key_block_header, block) {
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
