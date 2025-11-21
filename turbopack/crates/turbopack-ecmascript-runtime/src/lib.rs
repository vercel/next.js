#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod asset_context;
pub(crate) mod browser_runtime;
#[cfg(feature = "test")]
pub(crate) mod dummy_runtime;
pub(crate) mod embed_js;
pub(crate) mod nodejs_runtime;
pub(crate) mod runtime_type;

pub use browser_runtime::get_browser_runtime_code;
#[cfg(feature = "test")]
pub use dummy_runtime::get_dummy_runtime_code;
pub use embed_js::{embed_file, embed_file_path, embed_fs};
pub use nodejs_runtime::get_nodejs_runtime_code;
pub use runtime_type::RuntimeType;
