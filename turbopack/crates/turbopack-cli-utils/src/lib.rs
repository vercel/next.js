#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

// Force linking `turbo-tasks-backend`'s `__tt_static_*` providers into
// this crate's test binary; see the matching dev-dep in `Cargo.toml`.
#[cfg(test)]
extern crate turbo_tasks_backend;

pub mod issue;
pub mod runtime_entry;
pub mod source_context;
