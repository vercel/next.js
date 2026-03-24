#![feature(once_cell_try)]
#![feature(sync_unsafe_cell)]
#![feature(iter_collect_into)]

mod arc_bytes;
mod collector;
mod collector_entry;
mod compaction;
mod compression;
mod constants;
mod db;
mod key;
mod lookup_entry;
mod merge_iter;
pub mod meta_file;
mod meta_file_builder;
pub mod mmap_helper;
mod parallel_scheduler;
mod sst_filter;
pub mod static_sorted_file;
mod static_sorted_file_builder;
mod value_block_count_tracker;
mod value_buf;
mod write_batch;

#[cfg(test)]
mod tests;

pub use arc_bytes::ArcBytes;
pub use compression::checksum_block;
pub use db::{CompactConfig, MetaFileEntryInfo, MetaFileInfo, TurboPersistence};

/// Controls how SST and meta files are read from disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessMode {
    /// Memory-map the file and access blocks via the mapped region.
    Mmap,
    /// Read blocks directly from the file via pread (no mmap).
    File,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FamilyKind {
    /// Each key maps to a single value (default LSM behavior).
    /// When multiple entries have the same key, only the newest is retained during compaction or
    /// returned by queries
    /// Access must use `get` not `get_multiple`
    SingleValue,
    /// Each key can map to multiple values.
    /// Duplicate values are not dropped.
    /// The order of values returned by `get_multiple` is undefined.
    /// Access must use `get_multiple` not `get`
    MultiValue,
}

/// Configuration for a single family to describe how the data is stored.
#[derive(Clone, Copy, Debug)]
pub struct FamilyConfig {
    pub kind: FamilyKind,
}

/// Database-wide configuration with per-family settings.
///
/// Each family (keyspace) can have different file size limits to optimize
/// for its specific access patterns and data characteristics.
#[derive(Clone, Debug)]
pub struct DbConfig<const FAMILIES: usize> {
    pub family_configs: [FamilyConfig; FAMILIES],
    /// How SST and meta files are read from disk.
    pub access_mode: AccessMode,
}

/// Reads the `TURBO_PERSISTENCE_MMAP` env var (cached). Returns `AccessMode::File` when the var
/// is set to `"0"`, `AccessMode::Mmap` otherwise.
fn access_mode_env_var() -> AccessMode {
    static ACCESS_MODE_ENV: std::sync::LazyLock<AccessMode> = std::sync::LazyLock::new(|| {
        if std::env::var("TURBO_PERSISTENCE_MMAP")
            .map(|v| v == "0")
            .unwrap_or(false)
        {
            AccessMode::File
        } else {
            AccessMode::Mmap
        }
    });
    *ACCESS_MODE_ENV
}

impl<const FAMILIES: usize> DbConfig<FAMILIES> {
    /// Returns a config with all defaults, reading the `TURBO_PERSISTENCE_MMAP` env var
    /// to determine the access mode.
    pub fn new() -> Self {
        Self {
            family_configs: [FamilyConfig {
                kind: FamilyKind::SingleValue,
            }; FAMILIES],
            access_mode: access_mode_env_var(),
        }
    }
}

impl<const FAMILIES: usize> Default for DbConfig<FAMILIES> {
    fn default() -> Self {
        Self::new()
    }
}
pub use key::{KeyBase, QueryKey, StoreKey, hash_key};
pub use meta_file::MetaEntryFlags;
pub use parallel_scheduler::{ParallelScheduler, SerialScheduler};
pub use static_sorted_file::{
    BlockCache, BlockWeighter, SstLookupResult, StaticSortedFile, StaticSortedFileMetaData,
};
pub use static_sorted_file_builder::{
    BLOCK_HEADER_SIZE, Entry, EntryValue, StreamingSstWriter, write_static_stored_file,
};
pub use value_buf::ValueBuffer;
pub use write_batch::WriteBatch;
