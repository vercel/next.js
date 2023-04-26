#![feature(hash_drain_filter)]
#![feature(option_get_or_insert_default)]
#![feature(type_alias_impl_trait)]
#![feature(lint_reasons)]
#![feature(box_patterns)]
#![feature(int_roundings)]
#![deny(unsafe_op_in_unsafe_fn)]

mod cell;
mod concurrent_priority_queue;
mod count_hash_set;
mod gc;
mod map_guard;
mod memory_backend;
mod memory_backend_with_pg;
mod output;
mod priority_pair;
pub mod scope;
pub mod stats;
mod task;
pub mod viz;

pub use memory_backend::MemoryBackend;
pub use memory_backend_with_pg::MemoryBackendWithPersistedGraph;
