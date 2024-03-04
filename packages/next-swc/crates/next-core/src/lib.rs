// TODO(alexkirsz) Remove once the diagnostic is fixed.
#![allow(rustc::untranslatable_diagnostic_trivial)]
#![feature(async_closure)]
#![feature(str_split_remainder)]
#![feature(impl_trait_in_assoc_type)]
#![feature(arbitrary_self_types)]
#![feature(iter_intersperse)]

mod app_segment_config;
pub mod app_structure;
mod babel;
mod bootstrap;
mod embed_js;
mod emit;
pub mod instrumentation;
mod loader_tree;
pub mod middleware;
pub mod mode;
pub mod next_app;
mod next_build;
pub mod next_client;
pub mod next_client_reference;
pub mod next_config;
pub mod next_dynamic;
pub mod next_edge;
mod next_font;
mod next_image;
mod next_import_map;
pub mod next_manifests;
pub mod next_pages;
mod next_route_matcher;
pub mod next_server;
mod next_server_component;
mod next_shared;
pub mod next_telemetry;
mod page_loader;
pub mod pages_structure;
mod sass;
pub mod tracing_presets;
mod transform_options;
pub mod url_node;
pub mod util;

pub use app_segment_config::{
    parse_segment_config_from_loader_tree, parse_segment_config_from_source,
};
pub use emit::{all_assets_from_entries, emit_all_assets, emit_assets, emit_client_assets};
pub use next_edge::context::{
    get_edge_chunking_context, get_edge_compile_time_info, get_edge_resolve_options_context,
};
pub use page_loader::{create_page_loader_entry_module, PageLoaderAsset};
use turbopack_binding::{turbo, turbopack};
pub use util::{get_asset_path_from_pathname, pathname_for_path, PathType};

pub fn register() {
    turbo_tasks::register();
    turbo::tasks_bytes::register();
    turbo::tasks_fs::register();
    turbo::tasks_fetch::register();
    turbopack::dev::register();
    turbopack::node::register();
    turbopack::turbopack::register();
    turbopack::image::register();
    turbopack::ecmascript::register();
    turbopack::ecmascript_plugin::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

#[cfg(all(feature = "native-tls", feature = "rustls-tls"))]
compile_error!("You can't enable both `native-tls` and `rustls-tls`");

#[cfg(all(not(feature = "native-tls"), not(feature = "rustls-tls")))]
compile_error!("You have to enable one of the TLS backends: `native-tls` or `rustls-tls`");
