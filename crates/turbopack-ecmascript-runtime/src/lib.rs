#![feature(arbitrary_self_types)]

pub(crate) mod asset_context;
pub(crate) mod build_runtime;
pub(crate) mod dev_runtime;
#[cfg(feature = "test")]
pub(crate) mod dummy_runtime;
pub(crate) mod embed_js;
pub(crate) mod runtime_type;

pub use build_runtime::get_nodejs_runtime_code;
pub use dev_runtime::get_browser_runtime_code;
#[cfg(feature = "test")]
pub use dummy_runtime::get_dummy_runtime_code;
pub use embed_js::{embed_file, embed_file_path, embed_fs};
pub use runtime_type::RuntimeType;

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
