#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

// Force linking `turbo-tasks-backend`'s `__tt_static_*` providers into
// this crate's test binary; see the matching dev-dep in `Cargo.toml`.
#[cfg(test)]
extern crate turbo_tasks_backend;

pub mod ecmascript;
pub mod node_native_binding;
pub mod resolve;
pub mod resolve_options_context;
pub mod typescript;
