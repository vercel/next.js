#![feature(hash_drain_filter)]
#![deny(unsafe_op_in_unsafe_fn)]

mod backend;
mod db;
pub mod new_version;
mod sortable_index;
mod table;

pub use backend::RocksDbBackend;

#[doc(hidden)]
pub mod private {
    pub use super::db::Database;
    pub use super::table::CFStats;
}
