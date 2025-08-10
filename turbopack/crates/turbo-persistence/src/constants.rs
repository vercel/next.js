/// Values larger than this become blob files
pub const MAX_MEDIUM_VALUE_SIZE: usize = 64 * 1024 * 1024;

/// Values larger than this become separate value blocks
// Note this must fit into 2 bytes length
pub const MAX_SMALL_VALUE_SIZE: usize = 64 * 1024 - 1;

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

/// Maximum RAM bytes for AMQF cache
pub const AMQF_CACHE_SIZE: u64 = 300 * 1024 * 1024;
pub const AMQF_AVG_SIZE: usize = 37399;

/// Maximum RAM bytes for key block cache
pub const KEY_BLOCK_CACHE_SIZE: u64 = 400 * 1024 * 1024;
pub const KEY_BLOCK_AVG_SIZE: usize = 16 * 1024;

/// Maximum RAM bytes for value block cache
pub const VALUE_BLOCK_CACHE_SIZE: u64 = 300 * 1024 * 1024;
pub const VALUE_BLOCK_AVG_SIZE: usize = 132000;
