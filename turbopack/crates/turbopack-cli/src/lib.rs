#![feature(future_join)]
#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod arguments;
pub mod build;
pub(crate) mod contexts;
// The dev server is a live HTTP+websocket server (hyper/tokio); async-build only.
// The one-shot `build` path is dual and runs under the no-tokio sync engine.
#[cfg(feature = "tokio_runtime")]
pub mod dev;
pub(crate) mod embed_js;
pub(crate) mod util;
