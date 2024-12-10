#![feature(future_join)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(impl_trait_in_assoc_type)]

mod app;
mod dynamic_imports;
mod empty;
pub mod entrypoints;
mod font;
pub mod global_module_id_strategy;
mod instrumentation;
mod loadable_manifest;
mod middleware;
mod module_graph;
mod nft_json;
mod pages;
pub mod paths;
pub mod project;
pub mod route;
mod server_actions;
mod versioned_content_map;
mod webpack_stats;

// Declare build-time information variables generated in build.rs
shadow_rs::shadow!(build);

pub fn register() {
    next_core::register();
    turbopack_nodejs::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
