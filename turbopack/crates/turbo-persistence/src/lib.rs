#![cfg_attr(target_os = "wasi", feature(wasi_ext))]
#![feature(once_cell_try)]
#![feature(sync_unsafe_cell)]
// Miri compiles a reduced test subset, leaving helpers from disabled tests intentionally unused.
#![cfg_attr(miri, allow(dead_code, unused_imports))]

mod arc_bytes;
pub(crate) mod be;
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
#[cfg(feature = "mmap")]
pub mod mmap_helper;
mod parallel_scheduler;
mod rc_bytes;
mod shared_bytes;
pub mod sst_filter;
pub mod static_sorted_file;
mod static_sorted_file_builder;
mod value_block_count_tracker;
mod value_buf;
mod write_batch;

#[cfg(test)]
mod tests;

pub use arc_bytes::ArcBytes;
pub use compression::{Compression, checksum_block};
pub use db::{
    CommitStats, CompactConfig, CurrentDbVersion, MetaFileEntryInfo, MetaFileInfo,
    TurboPersistence, read_current_version,
};

/// Controls how SST and meta files are read from disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessMode {
    /// Memory-map the file and access blocks via the mapped region.
    #[cfg(feature = "mmap")]
    Mmap,
    /// Read blocks directly from the file via pread (no mmap).
    File,
}

/// Configuration for a single family to describe how the data is stored.
#[derive(Clone, Copy, Debug)]
pub struct FamilyConfig {
    pub name: &'static str,
    pub compression: Compression,
}

/// Database-wide configuration with per-family storage settings.
///
/// Each family (keyspace) can select storage behavior suited to its access patterns and data
/// characteristics.
#[derive(Clone, Debug)]
pub struct DbConfig<const FAMILIES: usize> {
    pub family_configs: [FamilyConfig; FAMILIES],
    /// How SST and meta files are read from disk.
    pub access_mode: AccessMode,
}

/// Returns the default access mode for this execution environment.
///
/// Builds without mmap support always use file I/O. Builds with mmap support honor
/// `TURBO_PERSISTENCE_MMAP=0`; mmap remains the default otherwise.
fn default_access_mode() -> AccessMode {
    #[cfg(not(feature = "mmap"))]
    return AccessMode::File;

    #[cfg(feature = "mmap")]
    access_mode_env_var()
}

/// Returns mmap mode when the feature is enabled, and file mode otherwise.
///
/// Call sites that specifically want mmap use this helper because `AccessMode::Mmap` does not
/// exist without the feature; they fall back to file I/O and still exercise surrounding logic.
#[cfg(any(test, feature = "verify_sst_content"))]
pub(crate) fn mmap_access_mode() -> AccessMode {
    #[cfg(not(feature = "mmap"))]
    return AccessMode::File;

    #[cfg(feature = "mmap")]
    AccessMode::Mmap
}

#[cfg(feature = "mmap")]
fn access_mode_env_var() -> AccessMode {
    static ACCESS_MODE_ENV: std::sync::LazyLock<AccessMode> = std::sync::LazyLock::new(|| {
        if std::env::var("TURBO_PERSISTENCE_MMAP")
            .ok()
            .is_some_and(|v| v == "0")
        {
            AccessMode::File
        } else {
            AccessMode::Mmap
        }
    });
    *ACCESS_MODE_ENV
}

impl<const FAMILIES: usize> DbConfig<FAMILIES> {
    /// Returns a config with all defaults, using the execution environment's default access mode.
    pub fn new() -> Self {
        Self {
            family_configs: [FamilyConfig {
                name: "unknown",
                compression: Compression::Lz4,
            }; FAMILIES],
            access_mode: default_access_mode(),
        }
    }
}
/// The largest value stored directly in a key block.
pub use constants::MAX_INLINE_VALUE_SIZE;

impl<const FAMILIES: usize> Default for DbConfig<FAMILIES> {
    fn default() -> Self {
        Self::new()
    }
}
pub use key::{KeyBase, QueryKey, StoreKey, hash_key};
pub use meta_file::MetaEntryFlags;
pub use parallel_scheduler::{ParallelScheduler, SerialScheduler};
pub use static_sorted_file::{
    BlockCache, BlockCacheLifecycle, BlockWeighter, KeyBlockLayout, SstLookupResult,
    StaticSortedFile, StaticSortedFileMetaData,
};
pub use static_sorted_file_builder::{
    BLOCK_HEADER_SIZE, Entry, EntryValue, StreamingSstWriter, write_static_stored_file,
};
pub use value_buf::ValueBuffer;
pub use write_batch::WriteBatch;
