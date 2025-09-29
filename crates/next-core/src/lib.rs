#![feature(str_split_remainder)]
#![feature(impl_trait_in_assoc_type)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(iter_intersperse)]

mod app_page_loader_tree;
pub mod app_structure;
mod base_loader_tree;
mod bootstrap;
mod embed_js;
mod emit;
pub mod hmr_entry;
pub mod instrumentation;
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
mod next_root_params;
mod next_route_matcher;
pub mod next_server;
pub mod next_server_component;
pub mod next_server_utility;
mod next_shared;
pub mod next_telemetry;
mod page_loader;
pub mod pages_structure;
pub mod raw_ecmascript_module;
pub mod segment_config;
pub mod tracing_presets;
mod transform_options;
pub mod url_node;
pub mod util;

pub use emit::{all_assets_from_entries, emit_all_assets, emit_assets};
pub use next_edge::context::{
    get_edge_chunking_context, get_edge_chunking_context_with_client_assets,
    get_edge_compile_time_info, get_edge_resolve_options_context,
};
pub use next_import_map::get_next_package;
pub use page_loader::{PageLoaderAsset, create_page_loader_entry_module};
pub use segment_config::{parse_segment_config_from_loader_tree, parse_segment_config_from_source};
pub use util::{PathType, get_asset_path_from_pathname, pathname_for_path};
