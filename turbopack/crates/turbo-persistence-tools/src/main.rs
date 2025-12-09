#![feature(iter_intersperse)]

use std::{
    collections::HashMap,
    fs,
    hash::Hasher,
    io::{Write, stdout},
    path::PathBuf,
};

use anyhow::{Context, Result, bail};
use clap::Parser;
use rustc_hash::FxHashMap;
use turbo_persistence::{MetaFileEntryInfo, OwnedLookupEntry, SerialScheduler, TurboPersistence};
use twox_hash::XxHash64;

/// POT configuration matching the backend's serialization
const POT_CONFIG: pot::Config = pot::Config::new().compatibility(pot::Compatibility::V4);

/// Load the .functions.map file and return a mapping from function ID to function name
fn load_function_names(cache_path: &std::path::Path) -> Result<FxHashMap<u64, String>> {
    let functions_map_path = cache_path.join(".functions.map");

    if !functions_map_path.exists() {
        eprintln!(
            "Warning: .functions.map file not found at {}",
            functions_map_path.display()
        );
        return Ok(FxHashMap::default());
    }

    let content = fs::read_to_string(&functions_map_path)
        .with_context(|| format!("Failed to read {}", functions_map_path.display()))?;

    let mut map = FxHashMap::default();
    for line in content.lines() {
        // Each line format: "<id> <name>"
        if let Some((id_str, name)) = line.split_once(' ') {
            if let Ok(id) = id_str.parse::<u64>() {
                map.insert(id, name.to_string());
            }
        }
    }

    Ok(map)
}

/// Deserialize a value as pot::Value to extract enum variant names
fn deserialize_as_pot_value(bytes: &[u8]) -> Result<pot::Value<'_>> {
    POT_CONFIG
        .deserialize(bytes)
        .context("Failed to deserialize as pot::Value")
}

/// Extract enum variant name and value from a pot::Value that represents a CachedDataItem
/// Returns (variant_name, variant_value)
fn extract_variant<'a>(value: &'a pot::Value<'a>) -> Result<(String, pot::Value<'a>)> {
    // A CachedDataItem enum is serialized as mappings with the variant name as key
    if let pot::Value::Mappings(mappings) = value {
        if let Some((key, val)) = mappings.first() {
            if let pot::Value::String(variant_name) = key {
                return Ok((variant_name.to_string(), val.clone()));
            }
        }
    }
    bail!("Invalid CachedDataItem format")
}

/// Serialize a pot::Value back to bytes and return (bytes, hash)
fn serialize_and_hash_pot_value(value: &pot::Value) -> Result<(Vec<u8>, u64)> {
    // Serialize the pot::Value back to bytes
    let bytes = POT_CONFIG
        .serialize(value)
        .context("Failed to serialize pot::Value")?;

    // Hash the bytes
    let mut hasher = XxHash64::with_seed(0);
    hasher.write(&bytes);
    let hash = hasher.finish();

    Ok((bytes, hash))
}

/// Extract function ID from a CachedTaskType pot::Value
/// CachedTaskType is serialized as a tuple: (FunctionAndArg, this)
/// FunctionAndArg is serialized as a sequence: [function_id, arg]
fn extract_function_id(value: &pot::Value) -> Result<u64> {
    // CachedTaskType is serialized as a Sequence (tuple)
    if let pot::Value::Sequence(seq) = value {
        // First element should be FunctionAndArg (also a sequence)
        if let Some(pot::Value::Sequence(function_and_arg)) = seq.first() {
            // First element of FunctionAndArg is the function_id
            if let Some(function_id_value) = function_and_arg.first() {
                // The function_id is an integer - serialize it and deserialize as u64
                let id_bytes = POT_CONFIG
                    .serialize(function_id_value)
                    .context("Failed to serialize function ID")?;
                let id: u64 = POT_CONFIG
                    .deserialize(&id_bytes)
                    .context("Failed to deserialize function ID as u64")?;
                return Ok(id);
            }
        }
    }
    bail!("Could not extract function_id from CachedTaskType")
}

/// Per-variant statistics
#[derive(Default, Debug)]
struct VariantStats {
    /// Total count of this variant
    count: u64,
    /// Total size in bytes
    total_size: u64,
    /// Map of hash -> (count, size) for deduplication tracking
    unique_hashes: FxHashMap<u64, (u64, u64)>,
}

/// Statistics for CachedDataItem variants - using HashMap to avoid hard-coding variants
#[derive(Default, Debug)]
struct CachedDataItemStats {
    /// Maps variant name to its statistics
    variant_stats: FxHashMap<String, VariantStats>,
}

impl CachedDataItemStats {
    fn add_variant(&mut self, variant_name: String, value_hash: u64, size: u64) {
        let stats = self
            .variant_stats
            .entry(variant_name)
            .or_insert_with(Default::default);

        stats.count += 1;
        stats.total_size += size;

        // Track unique hashes: increment count and add to total size for this hash
        stats
            .unique_hashes
            .entry(value_hash)
            .and_modify(|(count, total_size)| {
                *count += 1;
                *total_size += size;
            })
            .or_insert((1, size));
    }

    fn total(&self) -> u64 {
        self.variant_stats.values().map(|s| s.count).sum()
    }
}

/// Statistics for ReverseTaskCache function IDs
#[derive(Default, Debug)]
struct FunctionIdStats {
    /// Maps function_id to (count, total_size)
    function_counts: FxHashMap<u64, (u64, u64)>,
}

impl FunctionIdStats {
    fn add_function(&mut self, function_id: u64, size: u64) {
        self.function_counts
            .entry(function_id)
            .and_modify(|(count, total_size)| {
                *count += 1;
                *total_size += size;
            })
            .or_insert((1, size));
    }

    fn total(&self) -> u64 {
        self.function_counts.values().map(|(count, _)| count).sum()
    }

    fn total_size(&self) -> u64 {
        self.function_counts.values().map(|(_, size)| size).sum()
    }

    fn top_n_by_count(&self, n: usize) -> Vec<(&u64, &(u64, u64))> {
        let mut entries: Vec<_> = self.function_counts.iter().collect();
        entries.sort_by(|a, b| b.1.0.cmp(&a.1.0).then_with(|| a.0.cmp(b.0)));
        entries.into_iter().take(n).collect()
    }

    fn top_n_by_size(&self, n: usize) -> Vec<(&u64, &(u64, u64))> {
        let mut entries: Vec<_> = self.function_counts.iter().collect();
        entries.sort_by(|a, b| b.1.1.cmp(&a.1.1).then_with(|| a.0.cmp(b.0)));
        entries.into_iter().take(n).collect()
    }
}

/// Per-function statistics including variant breakdown
#[derive(Default, Debug)]
struct FunctionStats {
    total_size: u64,
    count: u64,
    /// Maps variant name to (count, total_size)
    variant_breakdown: FxHashMap<String, (u64, u64)>,
}

impl FunctionStats {
    fn add_entry(&mut self, size: u64) {
        self.total_size += size;
        self.count += 1;
    }

    fn add_variant(&mut self, variant_name: String, size: u64) {
        self.variant_breakdown
            .entry(variant_name)
            .and_modify(|(count, total_size)| {
                *count += 1;
                *total_size += size;
            })
            .or_insert((1, size));
    }
}

/// Statistics for TaskMeta/TaskData sizes by function ID
#[derive(Default, Debug)]
struct SizeByFunctionStats {
    /// Maps function_id to FunctionStats
    function_stats: FxHashMap<u64, FunctionStats>,
}

impl SizeByFunctionStats {
    fn add_size(&mut self, function_id: u64, size: u64) {
        self.function_stats
            .entry(function_id)
            .or_default()
            .add_entry(size);
    }

    fn add_variant(&mut self, function_id: u64, variant_name: String, size: u64) {
        self.function_stats
            .entry(function_id)
            .or_default()
            .add_variant(variant_name, size);
    }

    fn total_size(&self) -> u64 {
        self.function_stats.values().map(|s| s.total_size).sum()
    }

    fn total_count(&self) -> u64 {
        self.function_stats.values().map(|s| s.count).sum()
    }

    fn top_n(&self, n: usize) -> Vec<(&u64, &FunctionStats)> {
        let mut entries: Vec<_> = self.function_stats.iter().collect();
        // Sort by size (descending)
        entries.sort_by(|a, b| {
            b.1.total_size
                .cmp(&a.1.total_size)
                .then_with(|| a.0.cmp(b.0))
        });
        entries.into_iter().take(n).collect()
    }
}

/// CLI tool for analyzing TurboPersistence cache statistics
#[derive(Parser, Debug)]
#[command(name = "turbo-persistence-tools")]
#[command(about = "Analyze TurboPersistence cache and generate statistics", long_about = None)]
struct Args {
    /// Path to the TurboPersistence cache directory
    #[arg(value_name = "CACHE_PATH")]
    cache_path: PathBuf,

    /// Include overwritten/old values in the analysis
    #[arg(long, default_value_t = false)]
    include_overwritten: bool,
}

/// Statistics for a single cache family
#[derive(Default)]
struct FamilyStats {
    entry_count: u64,
    total_key_size: u64,
    total_value_size: u64,
    /// Maps value hash to (count, total_size)
    unique_value_hashes: FxHashMap<u64, (u64, u64)>,
    min_entry_size: Option<u64>,
    max_entry_size: Option<u64>,
    /// CachedDataItem statistics (only for TaskMeta and TaskData families)
    cached_data_stats: Option<CachedDataItemStats>,
    /// Function ID statistics (only for ReverseTaskCache family)
    function_id_stats: Option<FunctionIdStats>,
    /// Size by function ID statistics (only for TaskMeta and TaskData families)
    size_by_function_stats: Option<SizeByFunctionStats>,
    /// Count of entries that failed to deserialize as CachedDataItems
    deserialization_failures: u64,
    /// First 10 deserialization errors
    deserialization_errors: Vec<String>,
}

impl FamilyStats {
    fn add_entry(&mut self, entry: &OwnedLookupEntry) {
        self.entry_count += 1;

        let key_size = entry.key.len() as u64;
        self.total_key_size += key_size;

        let value_size = entry.value.len() as u64;
        self.total_value_size += value_size;

        // Hash the value bytes for deduplication tracking
        let mut hasher = XxHash64::with_seed(0);
        hasher.write(&entry.value);
        let value_hash = hasher.finish();

        // Track duplicate sizes: increment count and add to total size
        self.unique_value_hashes
            .entry(value_hash)
            .and_modify(|(count, total_size)| {
                *count += 1;
                *total_size += value_size;
            })
            .or_insert((1, value_size));

        // Track entry size distribution
        let entry_size = key_size + value_size;
        self.min_entry_size = Some(
            self.min_entry_size
                .map_or(entry_size, |min| min.min(entry_size)),
        );
        self.max_entry_size = Some(
            self.max_entry_size
                .map_or(entry_size, |max| max.max(entry_size)),
        );
    }

    fn process_cached_data_items(
        &mut self,
        entry: &OwnedLookupEntry,
        task_to_function_map: &FxHashMap<Vec<u8>, u64>,
    ) -> Result<()> {
        // Deserialize the value as pot::Value to get a Vec of items
        let pot_value = deserialize_as_pot_value(&entry.value)?;

        // Expect a sequence (Vec)
        let items = match pot_value {
            pot::Value::Sequence(seq) => seq,
            _ => bail!("Expected a sequence of CachedDataItems"),
        };

        // Ensure we have stats tracking initialized
        let stats = self.cached_data_stats.get_or_insert_with(Default::default);

        // Look up the function ID for this task ID (key)
        let function_id_opt = task_to_function_map.get(entry.key.as_ref()).copied();

        // Process each item
        for item in items {
            // Extract the variant name and value
            let (variant_name, variant_value) = extract_variant(&item)?;

            // Serialize only the variant value (not the full enum with variant name)
            let (bytes, value_hash) = serialize_and_hash_pot_value(&variant_value)?;
            let size = bytes.len() as u64;
            stats.add_variant(variant_name.clone(), value_hash, size);

            // If we have a function ID, also track variant stats per function
            if let Some(function_id) = function_id_opt {
                let size_stats = self
                    .size_by_function_stats
                    .get_or_insert_with(Default::default);
                size_stats.add_variant(function_id, variant_name, size);
            }
        }

        Ok(())
    }

    fn process_reverse_task_cache(&mut self, entry: &OwnedLookupEntry) -> Result<()> {
        // Deserialize the value as pot::Value (it's a CachedTaskType)
        let pot_value = deserialize_as_pot_value(&entry.value)?;

        // Extract the function ID
        let function_id = extract_function_id(&pot_value)?;

        // Get the size of the entry
        let size = entry.value.len() as u64;

        // Ensure we have stats tracking initialized
        let stats = self.function_id_stats.get_or_insert_with(Default::default);
        stats.add_function(function_id, size);

        Ok(())
    }

    fn track_size_by_function(
        &mut self,
        entry: &OwnedLookupEntry,
        task_to_function_map: &FxHashMap<Vec<u8>, u64>,
    ) {
        // Look up the function ID for this task ID (key)
        if let Some(&function_id) = task_to_function_map.get(entry.key.as_ref()) {
            let size = entry.value.len() as u64;
            let stats = self
                .size_by_function_stats
                .get_or_insert_with(Default::default);
            stats.add_size(function_id, size);
        }
    }

    fn avg_entry_size(&self) -> u64 {
        if self.entry_count == 0 {
            0
        } else {
            (self.total_key_size + self.total_value_size) / self.entry_count
        }
    }

    fn total_size(&self) -> u64 {
        self.total_key_size + self.total_value_size
    }

    fn unique_value_count(&self) -> usize {
        self.unique_value_hashes.len()
    }

    fn duplicated_size(&self) -> u64 {
        // Sum up duplicate sizes: for each value that appears >1 time,
        // the duplicated size is (total_size - size_of_first_occurrence)
        self.unique_value_hashes
            .values()
            .filter_map(|&(count, total_size)| {
                if count > 1 {
                    // Duplicated size = total - first occurrence
                    // Since all occurrences have the same size: total_size / count * (count - 1)
                    let size_per_occurrence = total_size / count;
                    Some(size_per_occurrence * (count - 1))
                } else {
                    None
                }
            })
            .sum()
    }
}

/// Family names for the 5 KeySpaces used by TurboKeyValueDatabase
const FAMILY_NAMES: &[&str] = &[
    "Infra",            // 0: Infrastructure data
    "TaskMeta",         // 1: Task metadata
    "TaskData",         // 2: Task actual data
    "ForwardTaskCache", // 3: CachedTaskType -> TaskId lookups
    "ReverseTaskCache", // 4: TaskId -> CachedTaskType lookups
];

fn format_size(bytes: u64) -> String {
    const KIB: u64 = 1024;
    const MIB: u64 = 1024 * KIB;
    const GIB: u64 = 1024 * MIB;

    if bytes >= GIB {
        format!("{:.2} GiB", bytes as f64 / GIB as f64)
    } else if bytes >= MIB {
        format!("{:.2} MiB", bytes as f64 / MIB as f64)
    } else if bytes >= KIB {
        format!("{:.2} KiB", bytes as f64 / KIB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn format_function_name(function_id: u64, function_names: &FxHashMap<u64, String>) -> String {
    function_names
        .get(&function_id)
        .map(|s| s.as_str())
        .unwrap_or("(unknown)")
        .to_string()
}

fn main() -> Result<()> {
    let args = Args::parse();

    if !args.cache_path.exists() {
        bail!("Cache path does not exist: {}", args.cache_path.display());
    }

    println!("Analyzing cache at: {}", args.cache_path.display());
    println!("Include overwritten values: {}", args.include_overwritten);
    println!();

    // Open the database in read-only mode
    let db: TurboPersistence<SerialScheduler> =
        TurboPersistence::open_read_only(args.cache_path.clone())
            .context("Failed to open TurboPersistence database")?;

    // Display META and SST file structure
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("                     DATABASE FILE STRUCTURE");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!();

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

    println!();
    println!();

    // Load function names from .functions.map
    let function_names = load_function_names(&args.cache_path)?;
    if !function_names.is_empty() {
        println!("Loaded {} function names", function_names.len());
        println!();
    }

    // First pass: Build task_id -> function_id map from ReverseTaskCache (family 4)
    println!("Building task ID to function ID map from ReverseTaskCache...");
    let mut task_to_function_map: FxHashMap<Vec<u8>, u64> = FxHashMap::default();

    match db.iter(4, false) {
        Ok(iter) => {
            for entry_result in iter {
                if let Ok(entry) = entry_result {
                    // Deserialize the value to get the function ID
                    if let Ok(pot_value) = deserialize_as_pot_value(&entry.value) {
                        if let Ok(function_id) = extract_function_id(&pot_value) {
                            // Store task_id (key) -> function_id mapping
                            task_to_function_map.insert(entry.key.to_vec(), function_id);
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Warning: Failed to read ReverseTaskCache: {}", e);
        }
    }

    println!(
        "Mapped {} task IDs to function IDs",
        task_to_function_map.len()
    );
    println!();

    // Collect statistics for each family
    let mut family_stats: HashMap<usize, FamilyStats> = HashMap::new();
    let mut total_entries = 0u64;
    let mut total_errors = 0u64;

    println!("Scanning cache families...");
    println!();

    // Iterate over each family (0-4)
    for family in 0..5 {
        let family_name = FAMILY_NAMES.get(family).unwrap_or(&"Unknown");
        print!("Processing family {}: {}... ", family, family_name);
        stdout().flush().unwrap();

        let stats = family_stats.entry(family).or_default();

        match db.iter(family, args.include_overwritten) {
            Ok(iter) => {
                let mut family_entries = 0u64;

                for entry_result in iter {
                    match entry_result {
                        Ok(entry) => {
                            stats.add_entry(&entry);

                            // For TaskMeta (1) and TaskData (2), also deserialize and analyze
                            // CachedDataItems and track size by function ID (including variant
                            // breakdown)
                            if family == 1 || family == 2 {
                                if let Err(e) =
                                    stats.process_cached_data_items(&entry, &task_to_function_map)
                                {
                                    stats.deserialization_failures += 1;
                                    // Capture first 10 errors
                                    if stats.deserialization_errors.len() < 10 {
                                        stats.deserialization_errors.push(format!("{:#}", e));
                                    }
                                }
                                // Track total size by function ID
                                stats.track_size_by_function(&entry, &task_to_function_map);
                            }

                            // For ReverseTaskCache (4), extract function IDs
                            if family == 4 {
                                if let Err(e) = stats.process_reverse_task_cache(&entry) {
                                    stats.deserialization_failures += 1;
                                    // Capture first 10 errors
                                    if stats.deserialization_errors.len() < 10 {
                                        stats.deserialization_errors.push(format!("{:#}", e));
                                    }
                                }
                            }

                            family_entries += 1;
                            total_entries += 1;
                        }
                        Err(e) => {
                            eprintln!("Error reading entry: {}", e);
                            total_errors += 1;
                        }
                    }
                }

                println!("{} entries", family_entries);
            }
            Err(e) => {
                println!("ERROR: {}", e);
                total_errors += 1;
            }
        }
    }

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("                         CACHE STATISTICS SUMMARY");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!();

    // Print per-family statistics
    println!("PER-FAMILY STATISTICS:");
    println!("─────────────────────────────────────────────────────────────────────────────");
    println!(
        "{:<20} {:>12} {:>15} {:>15} {:>15}",
        "Family", "Entries", "Total Size", "Unique Values", "Avg Entry Size"
    );
    println!("─────────────────────────────────────────────────────────────────────────────");

    let mut grand_total_size = 0u64;
    let mut grand_unique_values = 0u64;

    for family in 0..5 {
        if let Some(stats) = family_stats.get(&family) {
            let family_name = FAMILY_NAMES.get(family).unwrap_or(&"Unknown");
            println!(
                "{:<20} {:>12} {:>15} {:>15} {:>15}",
                family_name,
                stats.entry_count,
                format_size(stats.total_size()),
                stats.unique_value_hashes.len(),
                format_size(stats.avg_entry_size())
            );

            grand_total_size += stats.total_size();
            grand_unique_values += stats.unique_value_hashes.len() as u64;
        }
    }

    println!("─────────────────────────────────────────────────────────────────────────────");
    println!(
        "{:<20} {:>12} {:>15} {:>15}",
        "TOTAL",
        total_entries,
        format_size(grand_total_size),
        grand_unique_values
    );
    println!();

    // Print detailed breakdown for each family
    println!();
    println!("DETAILED FAMILY BREAKDOWN:");
    println!("═══════════════════════════════════════════════════════════════════════════");

    for family in 0..5 {
        if let Some(stats) = family_stats.get(&family) {
            if stats.entry_count == 0 {
                continue;
            }

            let family_name = FAMILY_NAMES.get(family).unwrap_or(&"Unknown");
            println!();
            println!("Family {}: {}", family, family_name);
            println!(
                "─────────────────────────────────────────────────────────────────────────────"
            );
            println!("  Entries:           {}", stats.entry_count);
            println!("  Total key size:    {}", format_size(stats.total_key_size));
            println!(
                "  Total value size:  {}",
                format_size(stats.total_value_size)
            );
            println!("  Total size:        {}", format_size(stats.total_size()));
            println!(
                "  Unique values:     {} ({:.1}% deduplication)",
                stats.unique_value_count(),
                if stats.entry_count > 0 {
                    (1.0 - stats.unique_value_count() as f64 / stats.entry_count as f64) * 100.0
                } else {
                    0.0
                }
            );
            let dup_size = stats.duplicated_size();
            let dup_pct = if stats.total_value_size > 0 {
                (dup_size as f64 / stats.total_value_size as f64) * 100.0
            } else {
                0.0
            };
            println!(
                "  Duplicated size:   {} ({:.1}% of total value size)",
                format_size(dup_size),
                dup_pct
            );
            println!(
                "  Avg entry size:    {}",
                format_size(stats.avg_entry_size())
            );
            println!(
                "  Min entry size:    {}",
                stats
                    .min_entry_size
                    .map(format_size)
                    .unwrap_or_else(|| "N/A".to_string())
            );
            println!(
                "  Max entry size:    {}",
                stats
                    .max_entry_size
                    .map(format_size)
                    .unwrap_or_else(|| "N/A".to_string())
            );

            // Calculate percentage of total
            let pct = if grand_total_size > 0 {
                (stats.total_size() as f64 / grand_total_size as f64) * 100.0
            } else {
                0.0
            };
            println!("  % of total:        {:.1}%", pct);

            // Display deserialization failures for TaskMeta, TaskData, and ReverseTaskCache
            if (family == 1 || family == 2 || family == 4) && stats.deserialization_failures > 0 {
                println!(
                    "  Deserialization failures: {} ({:.1}% of entries)",
                    stats.deserialization_failures,
                    (stats.deserialization_failures as f64 / stats.entry_count as f64) * 100.0
                );
                if !stats.deserialization_errors.is_empty() {
                    println!("  First {} error(s):", stats.deserialization_errors.len());
                    for (i, error) in stats.deserialization_errors.iter().enumerate() {
                        println!("    {}. {}", i + 1, error);
                    }
                }
            }

            if let Some(cached_stats) = &stats.cached_data_stats {
                println!();
                println!("  CachedDataItem Variant Statistics:");
                println!(
                    "  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────"
                );
                println!(
                    "    {:<30} {:>10} {:>10} {:>12} {:>15} {:>15} {:>15} {:>10}",
                    "Variant",
                    "Count",
                    "Unique",
                    "Duplication",
                    "Total Size",
                    "Avg Size",
                    "Dup. Size",
                    "Dup. %"
                );
                println!(
                    "  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────"
                );

                let total = cached_stats.total();
                if total > 0 {
                    // Sort by variant name for consistent output
                    let mut variants: Vec<_> = cached_stats.variant_stats.iter().collect();
                    variants.sort_by_key(|(name, _)| *name);

                    for (variant_name, variant_stats) in variants {
                        let unique_count = variant_stats.unique_hashes.len();
                        let duplication_pct = if variant_stats.count > 0 {
                            (1.0 - unique_count as f64 / variant_stats.count as f64) * 100.0
                        } else {
                            0.0
                        };

                        let avg_size = if variant_stats.count > 0 {
                            variant_stats.total_size / variant_stats.count
                        } else {
                            0
                        };

                        // Calculate duplicated size: for each hash with count > 1,
                        // the duplicated size is (total_size - size_of_first_occurrence)
                        let duplicated_size: u64 = variant_stats
                            .unique_hashes
                            .values()
                            .filter_map(|&(count, total_size)| {
                                if count > 1 {
                                    // Size per occurrence
                                    let size_per_occurrence = total_size / count;
                                    // Duplicated size = total - first occurrence
                                    Some(size_per_occurrence * (count - 1))
                                } else {
                                    None
                                }
                            })
                            .sum();

                        let duplicated_size_pct = if variant_stats.total_size > 0 {
                            (duplicated_size as f64 / variant_stats.total_size as f64) * 100.0
                        } else {
                            0.0
                        };

                        println!(
                            "    {:<30} {:>10} {:>10} {:>11.1}% {:>15} {:>15} {:>15} {:>9.1}%",
                            variant_name,
                            variant_stats.count,
                            unique_count,
                            duplication_pct,
                            format_size(variant_stats.total_size),
                            format_size(avg_size),
                            format_size(duplicated_size),
                            duplicated_size_pct
                        );
                    }

                    println!(
                        "  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────"
                    );
                    println!("    {:<30} {:>10}", "Total Items:", total);
                }
            }

            // Display Size by Function ID statistics for TaskMeta and TaskData
            if family == 1 || family == 2 {
                if let Some(size_stats) = &stats.size_by_function_stats {
                    println!();
                    println!("  Top 20 Functions by Size:");

                    let total_size = size_stats.total_size();
                    let total_count = size_stats.total_count();
                    if total_size > 0 {
                        let top_functions = size_stats.top_n(20);

                        // Measure the maximum function name length in top 20
                        let max_func_len = top_functions
                            .iter()
                            .map(|(function_id, _)| {
                                format_function_name(**function_id, &function_names).len()
                            })
                            .max()
                            .unwrap_or(50)
                            .max(20); // Minimum width of 20

                        // Calculate separator length
                        let separator_len = max_func_len + 4 + 15 + 15 + 6; // padding + two columns + spaces
                        let separator = "─".repeat(separator_len);

                        println!("  {}", separator);
                        println!(
                            "    {:<width$} {:>15} {:>15}",
                            "Function",
                            "Count",
                            "Total Size",
                            width = max_func_len
                        );
                        println!("  {}", separator);

                        for (function_id, func_stats) in top_functions {
                            let func_name = format_function_name(*function_id, &function_names);
                            println!(
                                "    {:<width$} {:>15} {:>15}",
                                func_name,
                                func_stats.count,
                                format_size(func_stats.total_size),
                                width = max_func_len
                            );

                            // Display variant breakdown for this function
                            if !func_stats.variant_breakdown.is_empty() {
                                let mut variants: Vec<_> =
                                    func_stats.variant_breakdown.iter().collect();
                                // Sort by size descending
                                variants
                                    .sort_by(|a, b| b.1.1.cmp(&a.1.1).then_with(|| a.0.cmp(b.0)));

                                for (variant_name, (var_count, var_size)) in variants {
                                    println!(
                                        "      └─ {:<width$} {:>15} {:>15}",
                                        variant_name,
                                        var_count,
                                        format_size(*var_size),
                                        width = max_func_len.saturating_sub(3)
                                    );
                                }
                            }
                        }

                        println!("  {}", separator);
                        println!(
                            "    {:<width$} {:>15} {:>15}",
                            "Total Functions:",
                            size_stats.function_stats.len(),
                            "",
                            width = max_func_len
                        );
                        println!(
                            "    {:<width$} {:>15} {:>15}",
                            "Total:",
                            total_count,
                            format_size(total_size),
                            width = max_func_len
                        );
                    }
                }
            }

            // Display Function ID statistics for ReverseTaskCache
            if family == 4 {
                if let Some(func_stats) = &stats.function_id_stats {
                    let total_funcs = func_stats.total();
                    let total_size = func_stats.total_size();

                    if total_funcs > 0 {
                        // First table: Top 20 by Size
                        println!();
                        println!("  Top 20 Functions by Size:");

                        let top_by_size = func_stats.top_n_by_size(20);

                        // Measure the maximum function name length in top 20
                        let max_func_len = top_by_size
                            .iter()
                            .map(|(function_id, _)| {
                                format_function_name(**function_id, &function_names).len()
                            })
                            .max()
                            .unwrap_or(50)
                            .max(20); // Minimum width of 20

                        // Calculate separator length
                        let separator_len = max_func_len + 4 + 15 + 15 + 6; // padding + two columns + spaces
                        let separator = "─".repeat(separator_len);

                        println!("  {}", separator);
                        println!(
                            "    {:<width$} {:>15} {:>15}",
                            "Function",
                            "Count",
                            "Total Size",
                            width = max_func_len
                        );
                        println!("  {}", separator);

                        for (function_id, (count, size)) in top_by_size {
                            let func_name = format_function_name(*function_id, &function_names);
                            println!(
                                "    {:<width$} {:>15} {:>15}",
                                func_name,
                                count,
                                format_size(*size),
                                width = max_func_len
                            );
                        }

                        println!("  {}", separator);

                        // Second table: Top 20 by Count
                        println!();
                        println!("  Top 20 Functions by Count:");

                        let top_by_count = func_stats.top_n_by_count(20);

                        // Measure the maximum function name length in top 20
                        let max_func_len = top_by_count
                            .iter()
                            .map(|(function_id, _)| {
                                format_function_name(**function_id, &function_names).len()
                            })
                            .max()
                            .unwrap_or(50)
                            .max(20); // Minimum width of 20

                        // Calculate separator length
                        let separator_len = max_func_len + 4 + 15 + 15 + 6; // padding + two columns + spaces
                        let separator = "─".repeat(separator_len);

                        println!("  {}", separator);
                        println!(
                            "    {:<width$} {:>15} {:>15}",
                            "Function",
                            "Count",
                            "Total Size",
                            width = max_func_len
                        );
                        println!("  {}", separator);

                        for (function_id, (count, size)) in top_by_count {
                            let func_name = format_function_name(*function_id, &function_names);
                            println!(
                                "    {:<width$} {:>15} {:>15}",
                                func_name,
                                count,
                                format_size(*size),
                                width = max_func_len
                            );
                        }

                        println!("  {}", separator);
                        println!(
                            "    {:<width$} {:>15} {:>15}",
                            "Total Functions:",
                            func_stats.function_counts.len(),
                            "",
                            width = max_func_len
                        );
                        println!(
                            "    {:<width$} {:>15} {:>15}",
                            "Total:",
                            total_funcs,
                            format_size(total_size),
                            width = max_func_len
                        );
                    }
                }
            }
        }
    }

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");

    if total_errors > 0 {
        println!();
        println!("⚠️  Total errors encountered: {}", total_errors);
    }

    println!();
    println!("Analysis complete!");

    Ok(())
}
