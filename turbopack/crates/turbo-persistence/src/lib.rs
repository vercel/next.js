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
mod family_format;
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
pub use db::{CompactConfig, MetaFileEntryInfo, MetaFileInfo, TurboPersistence};
pub use family_format::{
    DefaultFormat, DirectKeyFixedValue, DirectKeyVariableValue, FamilyFormat, FamilyFormats,
    FormatConfig, TaskIdKeyedFormat, TaskIdToHashFormat, key_to_range_value, rotate_key,
    rotated_key_to_u64, unrotate_key,
};
pub use key::{KeyBase, QueryKey, StoreKey, hash_key};
pub use meta_file::MetaEntryFlags;
pub use parallel_scheduler::{ParallelScheduler, SerialScheduler};
pub use static_sorted_file_builder::{
    DirectFixedEntry, DirectVariableEntry, write_direct_fixed_sst, write_direct_variable_sst,
};
pub use value_buf::ValueBuffer;
pub use write_batch::WriteBatch;
