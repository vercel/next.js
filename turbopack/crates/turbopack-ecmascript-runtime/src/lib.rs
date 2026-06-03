#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

// Force linking `turbo-tasks-backend`'s `__tt_static_*` providers into
// this crate's test binary; see the matching dev-dep in `Cargo.toml`.
#[cfg(test)]
extern crate turbo_tasks_backend;

pub(crate) mod browser_runtime;
#[cfg(feature = "test")]
pub(crate) mod dummy_runtime;
pub(crate) mod embed_js;
pub(crate) mod nodejs_runtime;
pub(crate) mod runtime_type;

pub use browser_runtime::{get_browser_runtime_code, get_worker_runtime_code};
#[cfg(feature = "test")]
pub use dummy_runtime::get_dummy_runtime_code;
pub use embed_js::{embed_file, embed_file_path, embed_fs, turbopack_runtime_import_map};
pub use nodejs_runtime::get_nodejs_runtime_code;
pub use runtime_type::RuntimeType;
