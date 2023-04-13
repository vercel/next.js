#![feature(lint_reasons)]
#![feature(iter_intersperse)]

pub(crate) mod chunking_context;
pub(crate) mod ecmascript;
pub mod embed_js;
pub mod react_refresh;

pub use chunking_context::{DevChunkingContext, DevChunkingContextBuilder, DevChunkingContextVc};

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
