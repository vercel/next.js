#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod chunking_context;
pub mod ecmascript;
pub mod fs;

pub use chunking_context::{NodeJsChunkingContext, NodeJsChunkingContextBuilder};
