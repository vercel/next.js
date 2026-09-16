//! turbopack-cli-core — the shared building blocks for the standalone Turbopack CLI: the
//! client asset/module/resolve contexts, HTML entry handling, and filesystem helpers.

#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod contexts;
pub mod entry;
pub mod fs;
pub mod html;
