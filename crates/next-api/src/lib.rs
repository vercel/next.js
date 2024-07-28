#![feature(future_join)]
#![feature(arbitrary_self_types)]
#![feature(impl_trait_in_assoc_type)]

mod app;
mod dynamic_imports;
pub mod entrypoints;
mod font;
mod instrumentation;
mod loadable_manifest;
mod middleware;
mod pages;
pub mod paths;
pub mod project;
pub mod route;
mod server_actions;
mod versioned_content_map;

// Declare build-time information variables generated in build.rs
shadow_rs::shadow!(build);

pub fn register() {
    next_core::register();
    turbopack_binding::turbopack::nodejs::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
