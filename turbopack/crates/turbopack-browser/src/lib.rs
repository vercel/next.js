#![feature(iter_intersperse)]
#![feature(int_roundings)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod chunking_context;
pub mod ecmascript;
pub mod react_refresh;

pub use chunking_context::{BrowserChunkingContext, BrowserChunkingContextBuilder};

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    turbopack_ecmascript_runtime::register();
    turbopack_resolve::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
