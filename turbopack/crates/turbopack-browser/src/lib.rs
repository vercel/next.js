#![feature(iter_intersperse)]
#![feature(int_roundings)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub(crate) mod chunking_context;
pub mod ecmascript;
pub mod react_refresh;

pub use chunking_context::{
    BrowserChunkingContext, BrowserChunkingContextBuilder, ContentHashing, CurrentChunkMethod,
};
