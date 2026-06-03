#![feature(arbitrary_self_types_pointers)]

// Force linking `turbo-tasks-backend`'s `__tt_static_*` providers into
// this crate's test binary. The backend is a regular dep but rustc
// only adds rlibs to the link command for crates Rust code references.
#[cfg(test)]
extern crate turbo_tasks_backend;

pub mod compressed_size;
pub mod split_chunk;
