#![feature(hash_drain_filter)]
#![deny(unsafe_op_in_unsafe_fn)]
#![feature(generic_associated_types)]

mod cell;
mod memory_backend;
mod memory_backend_with_pg;
mod output;
mod scope;
pub mod stats;
mod task;
pub mod viz;

pub use memory_backend::MemoryBackend;
pub use memory_backend_with_pg::MemoryBackendWithPersistedGraph;
