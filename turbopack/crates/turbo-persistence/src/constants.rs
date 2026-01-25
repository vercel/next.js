/// Values larger than this become blob files
pub const MAX_MEDIUM_VALUE_SIZE: usize = 64 * 1024 * 1024;

/// Values larger than this become separate value blocks
// Note this must fit into 2 bytes length
pub const MAX_SMALL_VALUE_SIZE: usize = 64 * 1024 - 1;

/// Maximum size for inline values stored directly in key blocks.
/// Currently 8 bytes (break-even with the 8-byte indirection overhead).
/// Can be increased up to 247 bytes (type 255 - 8) if desired.
/// See static_sorted_file.rs for the static assertion enforcing this limit.
pub const MAX_INLINE_VALUE_SIZE: usize = 8;

/// Maximum number of entries per SST file
pub const MAX_ENTRIES_PER_INITIAL_FILE: usize = 256 * 1024;

/// Maximum number of entries per SST file
pub const MAX_ENTRIES_PER_COMPACTED_FILE: usize = 1024 * 1024;

/// Finish file when total amount of data exceeds this
pub const DATA_THRESHOLD_PER_INITIAL_FILE: usize = 64 * 1024 * 1024;

/// Finish file when total amount of data exceeds this
pub const DATA_THRESHOLD_PER_COMPACTED_FILE: usize = 256 * 1024 * 1024;

/// Reduction factor (as bit shift) for the size of the thread-local buffer as shift of
/// MAX_ENTRIES_PER_INITIAL_FILE and DATA_THRESHOLD_PER_INITIAL_FILE.
pub const THREAD_LOCAL_SIZE_SHIFT: usize = 7;

/// Maximum RAM bytes for key block cache
pub const KEY_BLOCK_CACHE_SIZE: u64 = 400 * 1024 * 1024;
pub const KEY_BLOCK_AVG_SIZE: usize = 16 * 1024;

/// Maximum RAM bytes for value block cache
pub const VALUE_BLOCK_CACHE_SIZE: u64 = 300 * 1024 * 1024;
pub const VALUE_BLOCK_AVG_SIZE: usize = 132000;

/// Configuration for a single family's file limits.
///
/// Controls when SST files are split during writes and compaction.
/// Files are split when either the entry count OR data size threshold is reached.
#[derive(Clone, Copy, Debug)]
pub struct FamilyConfig {
    /// Maximum number of entries per initial SST file (during writes)
    pub max_entries_per_initial_file: usize,
    /// Data size threshold for initial SST files (bytes)
    pub data_threshold_per_initial_file: usize,
    /// Maximum number of entries per compacted SST file
    pub max_entries_per_compacted_file: usize,
    /// Data size threshold for compacted SST files (bytes)
    pub data_threshold_per_compacted_file: usize,
}

impl Default for FamilyConfig {
    fn default() -> Self {
        Self {
            max_entries_per_initial_file: MAX_ENTRIES_PER_INITIAL_FILE,
            data_threshold_per_initial_file: DATA_THRESHOLD_PER_INITIAL_FILE,
            max_entries_per_compacted_file: MAX_ENTRIES_PER_COMPACTED_FILE,
            data_threshold_per_compacted_file: DATA_THRESHOLD_PER_COMPACTED_FILE,
        }
    }
}

/// Database-wide configuration with per-family settings.
///
/// Each family (keyspace) can have different file size limits to optimize
/// for its specific access patterns and data characteristics.
#[derive(Clone, Debug)]
pub struct DbConfig<const FAMILIES: usize> {
    pub family_configs: [FamilyConfig; FAMILIES],
}

impl<const FAMILIES: usize> Default for DbConfig<FAMILIES> {
    fn default() -> Self {
        Self {
            family_configs: [FamilyConfig::default(); FAMILIES],
        }
    }
}
