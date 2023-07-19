// TODO(alexkirsz) Remove once the diagnostic is fixed.
#![allow(rustc::untranslatable_diagnostic_trivial)]
#![feature(async_closure)]
#![feature(str_split_remainder)]
#![feature(impl_trait_in_assoc_type)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

mod app_render;
mod app_segment_config;
mod app_source;
pub mod app_structure;
mod babel;
mod bootstrap;
pub mod dev_manifest;
mod embed_js;
mod emit;
pub mod env;
mod fallback;
pub mod loader_tree;
pub mod mode;
pub mod next_app;
mod next_build;
pub mod next_client;
pub mod next_client_chunks;
mod next_client_component;
pub mod next_client_reference;
pub mod next_config;
pub mod next_dynamic;
mod next_edge;
mod next_font;
pub mod next_image;
mod next_import_map;
pub mod next_manifests;
mod next_route_matcher;
pub mod next_server;
pub mod next_server_component;
pub mod next_shared;
mod page_loader;
mod page_source;
pub mod pages_structure;
pub mod router;
pub mod router_source;
mod runtime;
mod sass;
mod transform_options;
pub mod url_node;
pub mod util;
mod web_entry_source;

pub use app_source::create_app_source;
pub use emit::{all_server_paths, emit_all_assets};
pub use page_loader::create_page_loader_entry_module;
pub use page_source::create_page_source;
pub use turbopack_binding::{turbopack::node::source_map, *};
pub use util::{get_asset_path_from_pathname, pathname_for_path, PathType};
pub use web_entry_source::create_web_entry_source;

pub fn register() {
    turbo_tasks::register();
    turbo::tasks_bytes::register();
    turbo::tasks_fs::register();
    turbo::tasks_fetch::register();
    turbopack::dev::register();
    turbopack::dev_server::register();
    turbopack::node::register();
    turbopack::turbopack::register();
    turbopack::image::register();
    turbopack::ecmascript::register();
    turbopack::ecmascript_plugin::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
