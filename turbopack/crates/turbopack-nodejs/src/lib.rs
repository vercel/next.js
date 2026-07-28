#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod chunking_context;
pub mod ecmascript;

pub use chunking_context::{NodeJsChunkingContext, NodeJsChunkingContextBuilder};
pub use ecmascript::{
    EcmascriptBuildNodeChunk, EcmascriptBuildNodeEntryChunk, EcmascriptBuildNodeRuntimeChunk,
};
