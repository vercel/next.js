#![feature(hash_drain_filter)]
#![deny(unsafe_op_in_unsafe_fn)]

mod db;
mod persisted_graph;
mod table;

pub use persisted_graph::RocksDbPersistedGraph;

#[doc(hidden)]
pub mod private {
    pub use super::db::Database;
    pub use crate::table::CFStats;
}
