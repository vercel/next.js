#![feature(iter_intersperse)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod chunking_context;
pub(crate) mod ecmascript;

pub use chunking_context::{NodeJsChunkingContext, NodeJsChunkingContextBuilder};
