#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(impl_trait_in_assoc_type)]

pub mod analyze;
mod app;
mod asset_hashes_manifest;
mod client_references;
mod dynamic_imports;
mod empty;
pub mod entrypoints;
mod font;
mod instrumentation;
mod loadable_manifest;
mod middleware;
mod module_graph;
pub mod next_server_nft;
mod nft;
mod nft_json;
pub mod operation;
mod pages;
pub mod paths;
pub mod project;
pub mod project_asset_hashes_manifest;
pub mod route;
pub mod routes_hashes_manifest;
mod server_actions;
mod sri_manifest;
mod versioned_content_map;
