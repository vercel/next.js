#![feature(hash_drain_filter)]
#![feature(option_get_or_insert_default)]
#![deny(unsafe_op_in_unsafe_fn)]

mod cell;
mod count_hash_set;
mod memory_backend;
mod memory_backend_with_pg;
mod output;
mod scope;
pub mod stats;
mod task;
mod task_stats;
pub mod viz;

pub use memory_backend::MemoryBackend;
pub use memory_backend_with_pg::MemoryBackendWithPersistedGraph;
