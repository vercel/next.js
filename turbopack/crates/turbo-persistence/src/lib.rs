#![feature(once_cell_try)]
#![feature(get_mut_unchecked)]
#![feature(sync_unsafe_cell)]
#![feature(iter_collect_into)]

mod arc_slice;
mod collector;
mod collector_entry;
mod compaction;
mod compression;
mod constants;
mod db;
mod key;
mod lookup_entry;
mod merge_iter;
mod meta_file;
mod meta_file_builder;
mod parallel_scheduler;
mod sst_filter;
mod static_sorted_file;
mod static_sorted_file_builder;
mod value_buf;
mod write_batch;

#[cfg(test)]
mod tests;

pub use arc_slice::ArcSlice;
use constants::{DATA_THRESHOLD_PER_INITIAL_FILE, MAX_ENTRIES_PER_INITIAL_FILE};
pub use db::{CompactConfig, MetaFileEntryInfo, MetaFileInfo, TurboPersistence};

/// How to deduplicate entries during compaction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeduplicationMode {
    /// Keep only the newest entry for each key (default LSM behavior).
    /// When multiple entries have the same key, only the last one is retained.
    ByKeyOnly,
    /// Keep entries that differ by key OR value (for hash-collision-tolerant keyspaces).
    /// Only drops entries that are true duplicates (same key AND same value).
    /// Use this when a keyspace may contain different values that hash to the same key.
    ByKeyAndValue,
}
/// Configuration for a single family's file limits during writes.
///
/// Controls when SST files are split during writes.
/// Files are split when either the entry count OR data size threshold is reached.
///
/// Note: Compaction uses the global constants `MAX_ENTRIES_PER_COMPACTED_FILE` and
/// `DATA_THRESHOLD_PER_COMPACTED_FILE` for all families.
#[derive(Clone, Copy, Debug)]
pub struct FamilyConfig {
    /// Maximum number of entries per initial SST file (during writes).
    /// Controls the size of the Collector datastructures when writing files,
    /// as well as when we switch to a 'sharded' file writing strategy.
    pub max_entries_per_initial_file: usize,
    /// Data size threshold for initial SST files (bytes).
    /// Controls memory usage during writes.
    pub data_threshold_per_initial_file: usize,

    /// How to handle duplicate keys during compaction
    pub deduplication_mode: DeduplicationMode,
}

impl Default for FamilyConfig {
    fn default() -> Self {
        Self {
            max_entries_per_initial_file: MAX_ENTRIES_PER_INITIAL_FILE,
            data_threshold_per_initial_file: DATA_THRESHOLD_PER_INITIAL_FILE,
            deduplication_mode: DeduplicationMode::ByKeyOnly,
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
pub use key::{KeyBase, QueryKey, StoreKey, hash_key};
pub use meta_file::MetaEntryFlags;
pub use parallel_scheduler::{ParallelScheduler, SerialScheduler};
pub use static_sorted_file::{
    BlockCache, BlockWeighter, SstLookupResult, StaticSortedFile, StaticSortedFileMetaData,
};
pub use static_sorted_file_builder::{Entry, EntryValue, write_static_stored_file};
pub use value_buf::ValueBuffer;
pub use write_batch::WriteBatch;
