/// Values larger than this become blob files
pub const MAX_MEDIUM_VALUE_SIZE: usize = 64 * 1024 * 1024;

/// Values larger than this become separate value blocks
// Note this must fit into 2 bytes length
// Note that a medium value has 14 bytes of extra overhead compared to a small value.
// Note that we want to benefit from better compression by merging small values together, so we can
// avoid a compression dictionary. At ≥4kB block size, compression works well without a dictionary.
// Note that medium values can be copied without decompression during compaction.
pub const MAX_SMALL_VALUE_SIZE: usize = 4096;

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

/// The minimum bytes that should accumulate before emitting a small value block.
/// Blocks are emitted once they reach this size, so actual block sizes range from
/// MIN_SMALL_VALUE_BLOCK_SIZE to MIN_SMALL_VALUE_BLOCK_SIZE + MAX_SMALL_VALUE_SIZE.
pub const MIN_SMALL_VALUE_BLOCK_SIZE: usize = 8 * 1024;

/// Maximum number of value blocks per SST file.
/// Must leave room for key blocks + index block within u16::MAX total blocks.
/// Uses u16::MAX / 2 to account for the 50/50 merge-and-split at end of compaction,
/// which can double the block count before splitting.
pub const MAX_VALUE_BLOCK_COUNT: usize = u16::MAX as usize / 2;

/// Maximum RAM bytes for key block cache
pub const KEY_BLOCK_CACHE_SIZE: u64 = 400 * 1024 * 1024;
pub const KEY_BLOCK_AVG_SIZE: usize = 16 * 1024;

/// Maximum RAM bytes for value block cache
pub const VALUE_BLOCK_CACHE_SIZE: u64 = 300 * 1024 * 1024;
pub const VALUE_BLOCK_AVG_SIZE: usize = 132000;
