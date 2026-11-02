#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod chunking_context;
pub mod ecmascript;
pub mod fs;
pub mod global_virtual_store;

pub use chunking_context::{NodeJsChunkingContext, NodeJsChunkingContextBuilder};
pub use ecmascript::node::{
    chunk::EcmascriptBuildNodeChunk, entry::runtime::EcmascriptBuildNodeRuntimeChunk,
};
