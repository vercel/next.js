#![feature(iter_intersperse)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod chunking_context;
pub(crate) mod ecmascript;

pub use chunking_context::{NodeJsChunkingContext, NodeJsChunkingContextBuilder};

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    turbopack_ecmascript_runtime::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
