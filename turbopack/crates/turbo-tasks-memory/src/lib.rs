#![feature(hash_extract_if)]
#![feature(type_alias_impl_trait)]
#![feature(box_patterns)]
#![feature(int_roundings)]
#![feature(impl_trait_in_assoc_type)]
#![deny(unsafe_op_in_unsafe_fn)]

mod aggregation;
mod cell;
mod count_hash_set;
mod edges_set;
mod gc;
mod map_guard;
mod memory_backend;
mod output;
mod task;

pub use memory_backend::MemoryBackend;
